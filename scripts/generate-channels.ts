import fs from 'fs';
import path from 'path';
import { Channel, Show, Episode } from '../src/types';
import { parseM3U } from '../src/utils/m3uParser';
import { getDeterministicDailySchedule } from '../src/engine/deterministicShuffle';
import { writeDailyScheduleFiles } from '../src/engine/scheduleManifestGenerator';

const DB_PATH = path.join(process.cwd(), 'data', 'database.json');
const PLAYLIST_TS_PATH = path.join(process.cwd(), 'src', 'data', 'playlist.ts');
const SERVER_DB_TS_PATH = path.join(process.cwd(), 'server', 'db.ts');
const COMMERCIALS_PATH = path.join(process.cwd(), 'commercials.json');

const SECONDS_IN_24H = 86400; // Strict 24-hour daily window
const TWENTY_MIN_SEC = 1200;  // 20-minute threshold for news clips

/**
 * Calculates a daily rotation offset based on the UTC day index so schedule order shifts every 24 hours.
 */
function getDailyRotationOffset(channelId: string, date: Date = new Date()): number {
  const dayIndex = Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
  const channelHash = channelId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return dayIndex * 13 + channelHash * 7;
}

/**
 * Reads local commercial break clips or provides default fallbacks.
 */
function loadCommercials(): Episode[] {
  if (fs.existsSync(COMMERCIALS_PATH)) {
    try {
      const raw = fs.readFileSync(COMMERCIALS_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {}
  }
  return [
    {
      id: 'comm-vintage-slate-1',
      title: 'Station ID & Interstitial Slate',
      season: '1',
      episodeNumber: '1',
      url: 'https://archive.org/download/classic_tv_commercials/station_id_slate.mp4',
      durationMs: 30000,
      runtimeMins: 1,
      isFiller: true,
      funFact: 'Retro Broadcast Interstitial Slate'
    }
  ];
}

/**
 * Rotates shows/episodes and builds a 24-hour schedule applying commercial injection rules.
 */
function applyCommercialsAnd24hCap(channel: Channel, isNews: boolean, commercials: Episode[]): Channel {
  const allEpisodes: Episode[] = [];
  channel.shows.forEach(show => {
    (show.episodes || []).forEach(ep => {
      if (!ep.isFiller) {
        allEpisodes.push(ep);
      }
    });
  });

  if (allEpisodes.length === 0) return channel;

  // 1. Deterministic Daily Round-Robin Shift
  const rotationOffset = getDailyRotationOffset(channel.id) % allEpisodes.length;
  const rotatedEpisodes = [
    ...allEpisodes.slice(rotationOffset),
    ...allEpisodes.slice(0, rotationOffset)
  ];

  const processedEpisodes: Episode[] = [];
  let accumDurationSec = 0;
  let epIdx = 0;
  let commIdx = 0;

  // 2. Build 24-Hour Window with Commercial Rules
  while (accumDurationSec < SECONDS_IN_24H && rotatedEpisodes.length > 0) {
    const ep = rotatedEpisodes[epIdx % rotatedEpisodes.length];
    const epSec = Math.round((ep.durationMs || (ep.runtimeMins ? ep.runtimeMins * 60 : 1800)) / 1000);

    if (accumDurationSec + epSec > SECONDS_IN_24H) {
      break;
    }

    const cleanEp: Episode = {
      ...ep,
      durationMs: epSec * 1000,
      runtimeMins: Math.ceil(epSec / 60),
      isFiller: false
    };
    processedEpisodes.push(cleanEp);
    accumDurationSec += epSec;

    // Commercial Rules
    if (isNews) {
      // NEWS RULE: No commercials UNLESS clip exceeds 20 minutes (1200s)
      if (epSec > TWENTY_MIN_SEC && commercials.length > 0) {
        const comm = commercials[commIdx % commercials.length];
        const commSec = Math.round((comm.durationMs || 30000) / 1000);
        if (accumDurationSec + commSec <= SECONDS_IN_24H) {
          processedEpisodes.push({
            ...comm,
            id: `comm-news-${channel.id}-${commIdx}-${epIdx}`,
            durationMs: commSec * 1000,
            runtimeMins: Math.ceil(commSec / 60),
            isFiller: true
          });
          accumDurationSec += commSec;
          commIdx++;
        }
      }
    } else {
      // REGULAR SHOW RULE: Exactly 1 commercial break between actual shows
      if (commercials.length > 0) {
        const comm = commercials[commIdx % commercials.length];
        const commSec = Math.round((comm.durationMs || 30000) / 1000);
        if (accumDurationSec + commSec <= SECONDS_IN_24H) {
          processedEpisodes.push({
            ...comm,
            id: `comm-break-${channel.id}-${commIdx}-${epIdx}`,
            durationMs: commSec * 1000,
            runtimeMins: Math.ceil(commSec / 60),
            isFiller: true
          });
          accumDurationSec += commSec;
          commIdx++;
        }
      }
    }

    epIdx++;
  }

  // 3. Backfill Dead Air up to EXACTLY 24 Hours (86,400 seconds) with Commercial Slates
  const deadAirSec = SECONDS_IN_24H - accumDurationSec;
  if (deadAirSec > 0) {
    const fillComm = (commercials.length > 0) ? commercials[commIdx % commercials.length] : {
      id: 'comm-vintage-slate-default',
      title: 'Station ID & Interstitial Slate',
      season: '1',
      episodeNumber: '1',
      url: 'https://archive.org/download/classic_tv_commercials/station_id_slate.mp4',
      durationMs: 30000,
      runtimeMins: 1,
      isFiller: true,
      funFact: 'Retro Broadcast Interstitial Slate'
    };

    processedEpisodes.push({
      ...fillComm,
      id: `comm-fill-slate-${channel.id}`,
      title: fillComm.title || 'Station ID & Commercial Slate',
      durationMs: deadAirSec * 1000,
      runtimeMins: Math.ceil(deadAirSec / 60),
      isFiller: true,
      funFact: `Auto-calculated dead-air backfill commercial slate (${deadAirSec}s).`
    });
    accumDurationSec += deadAirSec;
  }

  // Re-wrap into single 24-hour daily broadcast show
  const scheduledShow: Show = {
    id: `show-${channel.id}-24h-daily`,
    title: `${channel.name} Daily Broadcast`,
    description: `24-hour daily lineup for ${channel.name}`,
    year: '2026',
    genre: channel.category,
    episodes: processedEpisodes
  };

  return {
    ...channel,
    shows: [scheduledShow]
  };
}

function cleanTitleAndShow(rawTitle: string, url: string, isWestern: boolean) {
  const filename = decodeURIComponent(url.substring(url.lastIndexOf('/') + 1))
    .replace(/\.ia\.mp4$/i, '')
    .replace(/\.mp4$/i, '')
    .replace(/[-_]/g, ' ')
    .trim();

  let displayTitle = rawTitle;
  if (rawTitle.includes(' / ')) {
    const parts = rawTitle.split(' / ');
    displayTitle = parts[parts.length - 1];
  }

  displayTitle = displayTitle
    .replace(/\s+Ia$/i, '')
    .replace(/\s+IA$/i, '')
    .replace(/𝗧𝗢𝗣\s*𝗥𝗔𝗧𝗘𝗗/gi, '')
    .trim();

  let season = '1';
  let episodeNumber = '1';

  const sEPattern = /S(\d+)\s*E(\d+)/i.exec(displayTitle) || /S(\d+)\s*E(\d+)/i.exec(filename);
  const xPattern = /(\d+)X(\d+)/i.exec(displayTitle) || /(\d+)X(\d+)/i.exec(filename);

  if (sEPattern) {
    season = String(parseInt(sEPattern[1], 10));
    episodeNumber = String(parseInt(sEPattern[2], 10));
  } else if (xPattern) {
    season = String(parseInt(xPattern[1], 10));
    episodeNumber = String(parseInt(xPattern[2], 10));
  }

  const checkStr = `${displayTitle} ${filename} ${rawTitle} ${url}`;
  let showTitle = '';

  if (/ella-west|s-01.-e-17-ella-west|paladin|have\s*gun/i.test(checkStr)) showTitle = 'Have Gun – Will Travel';
  else if (/wagon\s*train/i.test(checkStr)) showTitle = 'Wagon Train';
  else if (/rawhide/i.test(checkStr)) showTitle = 'Rawhide';
  else if (/gunsmoke/i.test(checkStr)) showTitle = 'Gunsmoke';
  else if (/wells\s*fargo/i.test(checkStr)) showTitle = 'Tales of Wells Fargo';
  else if (/naked\s*city/i.test(checkStr)) showTitle = 'Naked City';
  else if (/maverick|point\s*blank/i.test(checkStr)) showTitle = 'Maverick';
  else if (/wanted\s*dead/i.test(checkStr)) showTitle = 'Wanted Dead or Alive';
  else if (/twilight\s*zone/i.test(checkStr)) showTitle = 'The Twilight Zone';
  else if (/branded/i.test(checkStr)) showTitle = 'Branded';
  else if (/bat\s*masterson/i.test(checkStr)) showTitle = 'Bat Masterson';
  else if (/lawman/i.test(checkStr)) showTitle = 'Lawman';
  else if (/man\s*with\s*a\s*camera/i.test(checkStr)) showTitle = 'Man With a Camera';
  else if (/johnny\s*staccato/i.test(checkStr)) showTitle = 'Johnny Staccato';
  else if (/death\s*valley/i.test(checkStr)) showTitle = 'Death Valley Days';
  else if (/bonanza/i.test(checkStr)) showTitle = 'Bonanza';
  else if (/rifleman/i.test(checkStr)) showTitle = 'The Rifleman';
  else if (/cheyenne/i.test(checkStr)) showTitle = 'Cheyenne';
  else if (/virginian/i.test(checkStr)) showTitle = 'The Virginian';
  else if (/laramie/i.test(checkStr)) showTitle = 'Laramie';
  else if (/lone\s*ranger/i.test(checkStr)) showTitle = 'The Lone Ranger';
  else if (/cisco\s*kid/i.test(checkStr)) showTitle = 'The Cisco Kid';
  else if (/daniel\s*boone/i.test(checkStr)) showTitle = 'Daniel Boone';
  else if (/zorro/i.test(checkStr)) showTitle = 'Zorro';
  else if (/high\s*chaparral/i.test(checkStr)) showTitle = 'The High Chaparral';
  else if (/big\s*valley/i.test(checkStr)) showTitle = 'The Big Valley';
  else if (/columbo/i.test(checkStr)) showTitle = 'Columbo';
  else if (/hawaii\s*five/i.test(checkStr)) showTitle = 'Hawaii Five-O';
  else if (/dragnet/i.test(checkStr)) showTitle = 'Dragnet';
  else if (/barney\s*miller/i.test(checkStr)) showTitle = 'Barney Miller';
  else if (/mission\s*impossible/i.test(checkStr)) showTitle = 'Mission: Impossible';
  else if (/murder,?\s*she\s*wrote/i.test(checkStr)) showTitle = 'Murder, She Wrote';
  else if (/brooklyn\s*nine/i.test(checkStr)) showTitle = 'Brooklyn Nine-Nine';
  else if (/adam\s*12|adam12/i.test(checkStr)) showTitle = 'Adam-12';
  else if (/cagney/i.test(checkStr)) showTitle = 'Cagney & Lacey';
  else if (/barnaby\s*jones/i.test(checkStr)) showTitle = 'Barnaby Jones';
  else if (/hunter/i.test(checkStr)) showTitle = 'Hunter';
  else if (/mod\s*squad/i.test(checkStr)) showTitle = 'The Mod Squad';
  else if (/jump\s*street/i.test(checkStr)) showTitle = '21 Jump Street';
  else if (/night\s*court/i.test(checkStr)) showTitle = 'Night Court';
  else if (/police\s*woman/i.test(checkStr)) showTitle = 'Police Woman';
  else if (/the\s*fbi/i.test(checkStr)) showTitle = 'The F.B.I.';
  else if (/wild\s*wild\s*west/i.test(checkStr)) showTitle = 'The Wild Wild West';
  else if (/cannon/i.test(checkStr)) showTitle = 'Cannon';
  else if (/gotham/i.test(checkStr)) showTitle = 'Gotham';
  else if (/fugitive/i.test(checkStr)) showTitle = 'The Fugitive';
  else if (/sopranos/i.test(checkStr)) showTitle = 'The Sopranos';
  else if (/hogan/i.test(checkStr)) showTitle = "Hogan's Heroes";
  else if (/total\s*drama/i.test(checkStr)) showTitle = 'Total Drama';
  else if (/king\s*lear/i.test(checkStr)) showTitle = 'Classic Cinema & Theater';

  if (!showTitle) {
    if (rawTitle.includes(' / ')) {
      let prefix = rawTitle.split(' / ')[0].trim();
      prefix = prefix
        .replace(/Ep\s*\d+.*/i, '')
        .replace(/\d+\s*X\s*\d+.*/i, '')
        .replace(/S-\d+.*/i, '')
        .replace(/S\d+E\d+.*/i, '')
        .replace(/\d{6}/, '')
        .replace(/01\s*Tv\s*Fighting\s*Crime\s*(Part\s*\d+)?/i, '')
        .trim();
      showTitle = prefix || (isWestern ? 'Classic Western Anthology' : 'Classic Crime Showcase');
    } else {
      showTitle = isWestern ? 'Classic Western Anthology' : 'Classic Crime Showcase';
    }
  }

  return {
    showTitle,
    title: displayTitle || filename,
    season,
    episodeNumber,
    url
  };
}

async function buildChannelFromM3uUrl(
  m3uUrl: string,
  channelMeta: {
    id: string;
    number: string;
    name: string;
    tagline: string;
    category: string;
    logoText: string;
    accentColor: string;
    isWestern: boolean;
  }
): Promise<Channel> {
  console.log(`📥 Fetching M3U from ${m3uUrl}...`);
  const res = await fetch(m3uUrl);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} when fetching ${m3uUrl}`);
  }
  const text = await res.text();

  const lines = text.split(/\r?\n/);
  const rawItems: { title: string; url: string; extDurationSec?: number }[] = [];
  let pendingTitle = '';
  let pendingDurationSec: number | undefined = undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      const commaIdx = line.indexOf(',');
      if (commaIdx !== -1) {
        const durPart = line.substring(8, commaIdx).trim();
        const parsedDur = parseInt(durPart, 10);
        if (!isNaN(parsedDur) && parsedDur > 0) {
          pendingDurationSec = parsedDur;
        } else {
          pendingDurationSec = undefined;
        }
        pendingTitle = line.substring(commaIdx + 1).trim();
      }
    } else if (line.startsWith('http://') || line.startsWith('https://')) {
      rawItems.push({ title: pendingTitle, url: line, extDurationSec: pendingDurationSec });
      pendingTitle = '';
      pendingDurationSec = undefined;
    }
  }

  console.log(`⚡ Parsed ${rawItems.length} M3U items for CH ${channelMeta.number} (${channelMeta.name})`);
  if (rawItems.length === 0) {
    throw new Error(`Empty M3U payload for channel ${channelMeta.name}`);
  }

  const showMap = new Map<string, Episode[]>();

  const getShowDefaultDurationSec = (showTitle: string): number => {
    const oneHourShows = [
      'Wagon Train', 'Rawhide', 'Gunsmoke', 'Tales of Wells Fargo', 'Naked City', 
      'Maverick', 'Murder, She Wrote', 'Mission: Impossible', 'Hawaii Five-O', 
      'The F.B.I.', 'Barnaby Jones', 'Hunter', 'Cagney & Lacey', 'The Fugitive', 
      'The Mod Squad', 'Cannon', 'Gotham', 'The Wild Wild West', '21 Jump Street', 'Adam-12'
    ];
    const isOneHour = oneHourShows.some(s => showTitle.toLowerCase().includes(s.toLowerCase()));
    return isOneHour ? 3000 : 1500;
  };

  rawItems.forEach((item, idx) => {
    const cleaned = cleanTitleAndShow(item.title, item.url, channelMeta.isWestern);
    const showTitle = cleaned.showTitle;

    if (!showMap.has(showTitle)) {
      showMap.set(showTitle, []);
    }

    const episodes = showMap.get(showTitle)!;
    const epId = `ep-${channelMeta.id}-${showTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${idx + 1}`;

    const durationSec = item.extDurationSec && item.extDurationSec > 0 
      ? item.extDurationSec 
      : getShowDefaultDurationSec(showTitle);

    const runtimeMins = Math.round(durationSec / 60);
    const durationMs = durationSec * 1000;

    episodes.push({
      id: epId,
      title: cleaned.title,
      season: cleaned.season,
      episodeNumber: String(episodes.length + 1),
      url: cleaned.url,
      funFact: `Authentic Archive.org stream from ${channelMeta.name} collection (${showTitle}). Duration: ${durationSec}s.`,
      runtimeMins,
      durationMs
    });
  });

  const shows: Show[] = [];
  showMap.forEach((episodes, showTitle) => {
    const showSlug = showTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    shows.push({
      id: `show-${channelMeta.id}-${showSlug}`,
      title: showTitle,
      description: `Classic TV broadcasts of ${showTitle}, sourced directly from Archive.org M3U stream collections.`,
      year: '1960-1990',
      genre: channelMeta.isWestern ? 'Western' : 'Crime / Noir',
      episodes
    });
  });

  shows.sort((a, b) => b.episodes.length - a.episodes.length);

  return {
    ...channelMeta,
    shows
  };
}

function buildNewsChannelFromFile(
  filePath: string,
  config: {
    id: string;
    number: string;
    name: string;
    category: string;
    tagline: string;
    logoText: string;
    accentColor: string;
    description?: string;
  }
): Channel {
  let rawEpisodes: any[] = [];
  const candidatePaths = [
    path.join(process.cwd(), filePath),
    path.join(process.cwd(), 'public', filePath),
    filePath
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.episodes) && parsed.episodes.length > 0) {
          rawEpisodes = parsed.episodes;
          break;
        }
      } catch (e) {}
    }
  }

  const showsMap: Record<string, Episode[]> = {};

  rawEpisodes.forEach((ep, idx) => {
    const net = ep.groupTitle || ep.network || 'Global News';
    if (!showsMap[net]) showsMap[net] = [];

    const durationSec = ep.duration || ep.durationSec || 1800;

    showsMap[net].push({
      id: ep.id || `ep-${config.id}-${idx + 1}`,
      title: ep.title || `${config.name} Segment`,
      season: String(ep.season || '1'),
      episodeNumber: String(showsMap[net].length + 1),
      url: ep.url,
      durationMs: durationSec * 1000,
      runtimeMins: Math.ceil(durationSec / 60),
      subtitleUrl: ep.subtitleUrl || '',
      thumbnailUrl: ep.thumbnailUrl || '',
      funFact: ep.description || `${config.name} broadcast segment.`
    });
  });

  const shows: Show[] = Object.entries(showsMap).map(([net, eps], showIdx) => ({
    id: `show-${config.id}-${showIdx + 1}`,
    title: `${net} Special Reports`,
    description: `Continuous broadcasts and news segments from ${net}`,
    year: '2026',
    genre: config.category,
    episodes: eps
  }));

  if (shows.length === 0) {
    shows.push({
      id: `show-${config.id}-default`,
      title: `${config.name} Daily Digest`,
      description: config.description || config.tagline,
      year: '2026',
      genre: config.category,
      episodes: [
        {
          id: `ep-${config.id}-1`,
          title: `${config.name} World Broadcast`,
          season: '1',
          episodeNumber: '1',
          url: 'https://archive.org/download/LINKTV_20190621_220000_DW_News/LINKTV_20190621_220000_DW_News.mp4',
          durationMs: 1800000,
          runtimeMins: 30,
          funFact: `${config.name} broadcast stream.`
        }
      ]
    });
  }

  return {
    id: config.id,
    number: config.number,
    name: config.name,
    tagline: config.tagline,
    category: config.category,
    logoText: config.logoText,
    accentColor: config.accentColor,
    shows
  };
}

export async function generateAndRegisterChannels() {
  console.log('🔄 [Channel Generator]: Starting channel generation & taxonomy sync...');

  const commercials = loadCommercials();

  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  let rawDb: any = { channels: [] };
  if (fs.existsSync(DB_PATH)) {
    try {
      rawDb = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (e) {
      console.warn('⚠️ Error reading database.json, starting fresh');
    }
  }
  const currentChannels: Channel[] = rawDb.channels || [];

  // 1. Westerns (CH 101)
  let westernsCh: Channel;
  try {
    westernsCh = await buildChannelFromM3uUrl(
      'https://archive.org/download/daily-highlights/BIG%20WESTERN%20ZONE.m3u',
      {
        id: 'ch-westerns',
        number: '101',
        name: 'Classic Westerns HD',
        tagline: 'High-noon showdowns and frontier justice.',
        category: 'TV Shows',
        logoText: 'WESTERN',
        accentColor: '#D97706',
        isWestern: true
      }
    );
  } catch (err: any) {
    console.warn('⚠️ Failed to build Western channel, using fallback:', err.message);
    westernsCh = currentChannels.find(c => c.id === 'ch-westerns' || c.number === '101') || {
      id: 'ch-westerns',
      number: '101',
      name: 'Classic Westerns HD',
      tagline: 'High-noon showdowns and frontier justice.',
      category: 'TV Shows',
      logoText: 'WESTERN',
      accentColor: '#D97706',
      shows: []
    };
  }

  // 2. Crime (CH 102)
  let crimeCh: Channel;
  try {
    crimeCh = await buildChannelFromM3uUrl(
      'https://archive.org/download/daily-highlights/TV%20CRIME_cleaned.m3u',
      {
        id: 'ch-retro-adventure',
        number: '102',
        name: 'Classic Cinema & TV Crime',
        tagline: '24/7 Noir, Mystery, Legal & Crime Classics',
        category: 'TV Shows',
        logoText: 'CRIME',
        accentColor: '#E11D48',
        isWestern: false
      }
    );
  } catch (err: any) {
    console.warn('⚠️ Failed to build Crime channel, using fallback:', err.message);
    crimeCh = currentChannels.find(c => c.id === 'ch-retro-adventure' || c.number === '102') || {
      id: 'ch-retro-adventure',
      number: '102',
      name: 'Classic Cinema & TV Crime',
      tagline: '24/7 Noir, Mystery, Legal & Crime Classics',
      category: 'TV Shows',
      logoText: 'CRIME',
      accentColor: '#E11D48',
      shows: []
    };
  }

  // 3. Comedy (CH 103)
  let comedyCh: Channel;
  try {
    comedyCh = await buildChannelFromM3uUrl(
      'https://archive.org/download/daily-highlights/hogans.m3u',
      {
        id: 'ch-comedy-103',
        number: '103',
        name: 'Classic Sitcoms & Comedy',
        tagline: '24/7 Retro Sitcoms, Cartoons & Comedies',
        category: 'TV Shows',
        logoText: 'COMEDY',
        accentColor: '#EC4899',
        isWestern: false
      }
    );
  } catch (err: any) {
    console.warn('⚠️ Failed to build Comedy channel, using fallback:', err.message);
    comedyCh = currentChannels.find(c => c.id === 'ch-comedy-103' || c.number === '103') || {
      id: 'ch-comedy-103',
      number: '103',
      name: 'Classic Sitcoms & Comedy',
      tagline: '24/7 Retro Sitcoms, Cartoons & Comedies',
      category: 'TV Shows',
      logoText: 'COMEDY',
      accentColor: '#EC4899',
      shows: []
    };
  }

  // 4. Archive News (CH 104)
  const newsArchiveCh = buildNewsChannelFromFile('news.json', {
    id: 'ch-news-archive',
    number: '104',
    name: 'Retro News Network',
    category: 'Archive News',
    tagline: 'Historical television news broadcasts from Archive.org',
    logoText: 'RETRO NEWS',
    accentColor: '#2563EB',
    description: 'Historical television news broadcasts from Archive.org'
  });

  // 5. Current News (CH 105)
  const newsCurrentCh = buildNewsChannelFromFile('fresh_news.json', {
    id: 'ch-news-current',
    number: '105',
    name: 'Headline News Today',
    category: 'Current Events',
    tagline: 'Continuous daily updated global news updates',
    logoText: 'HEADLINE',
    accentColor: '#059669',
    description: 'Continuous daily updated global news updates'
  });

  // 6. 9/11 Archive (CH 106)
  async function build911ArchiveChannel(): Promise<Channel> {
    let manifestEpisodes: Episode[] = [];
    try {
      const manifestUrl = 'https://raw.githubusercontent.com/banamine/AJN-Collection-/main/stream-manifest-9-11%20september%202001.json';
      const res = await fetch(manifestUrl);
      if (res.ok) {
        const data = await res.json();
        const segments = data.segments || [];
        manifestEpisodes = segments.map((seg: any, idx: number) => {
          let itemId = seg.episodeId ? seg.episodeId.replace(/_\d{3}$/, '') : 'CNN_20010912_010000_America_Under_Attack';
          if (seg.thumbnail) {
            const match = seg.thumbnail.match(/archive\.org\/(services\/img|download)\/([^/]+)/);
            if (match && match[2]) itemId = match[2].replace(/\.thumbs$/, '');
          }
          const directUrl = `https://archive.org/download/${itemId}/${itemId}.mp4`;
          const cleanTitle = (seg.title || '9/11 Live Coverage').replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+/, '');
          return {
            id: `ep-911-manifest-${idx + 1}`,
            title: cleanTitle,
            season: '1',
            episodeNumber: String(idx + 1),
            url: directUrl,
            durationMs: (seg.durationSeconds || 600) * 1000,
            runtimeMins: (seg.durationSeconds || 600) / 60,
            isFiller: false,
            funFact: `September 11, 2001 Live Broadcast Segment (${itemId})`
          };
        });
      }
    } catch (err: any) {
      console.warn('⚠️ Could not fetch GitHub stream manifest:', err.message);
    }

    let m3uEpisodes: Episode[] = [];
    const m3uPath = path.join(process.cwd(), 'public', 'user_provided_911_playlist.m3u');
    if (fs.existsSync(m3uPath)) {
      const content = fs.readFileSync(m3uPath, 'utf8');
      const lines = content.split(/\r?\n/);
      let currentTitle = '';
      let currentDuration = 2502;
      for (let line of lines) {
        line = line.trim();
        if (line.startsWith('#EXTINF:')) {
          const match = line.match(/#EXTINF:(-?\d+),(.*)/);
          if (match) {
            currentDuration = parseInt(match[1], 10);
            if (currentDuration <= 0) currentDuration = 2502;
            currentTitle = match[2].trim();
          }
        } else if (line.startsWith('http')) {
          let url = line;
          if (url.endsWith('.mpg')) url = url.replace(/\.mpg$/i, '_512kb.mp4');
          m3uEpisodes.push({
            id: `ep-911-m3u-${m3uEpisodes.length + 1}`,
            title: currentTitle || 'September 11, 2001 Live Broadcast',
            season: '1',
            episodeNumber: String(m3uEpisodes.length + 1),
            url,
            durationMs: currentDuration * 1000,
            runtimeMins: currentDuration / 60,
            isFiller: false,
            funFact: 'Archive.org 9/11 Television Archive original broadcast recorded live on September 11, 2001.'
          });
          currentTitle = '';
          currentDuration = 2502;
        }
      }
    }

    const shows: Show[] = [];
    if (manifestEpisodes.length > 0) {
      shows.push({
        id: 'show-911-manifest-collection',
        title: 'CNN & Network 9/11 Stream Manifest Broadcasts',
        description: 'Epoch-synchronized stream segments from the September 11, 2001 Television Archive.',
        year: '2001',
        genre: 'News Archive',
        episodes: manifestEpisodes
      });
    }

    const abcEps = m3uEpisodes.filter(e => e.url.toLowerCase().includes('abc'));
    const nbcEps = m3uEpisodes.filter(e => e.url.toLowerCase().includes('nbc'));
    const cbsEps = m3uEpisodes.filter(e => e.url.toLowerCase().includes('cbs'));
    const cnnEps = m3uEpisodes.filter(e => e.url.toLowerCase().includes('cnn'));
    const bbcEps = m3uEpisodes.filter(e => e.url.toLowerCase().includes('bbc'));
    const foxEps = m3uEpisodes.filter(e => e.url.toLowerCase().includes('fox'));
    const otherEps = m3uEpisodes.filter(e => !e.url.toLowerCase().match(/(abc|nbc|cbs|cnn|bbc|fox)/));

    if (abcEps.length) shows.push({ id: 'show-911-abc', title: 'ABC News 9/11 Live Coverage', description: 'Original uninterrupted ABC News television broadcasts from September 11, 2001.', year: '2001', genre: 'News Archive', episodes: abcEps });
    if (nbcEps.length) shows.push({ id: 'show-911-nbc', title: 'NBC News 9/11 Live Coverage', description: 'Original uninterrupted NBC News television broadcasts from September 11, 2001.', year: '2001', genre: 'News Archive', episodes: nbcEps });
    if (cbsEps.length) shows.push({ id: 'show-911-cbs', title: 'CBS News 9/11 Live Coverage', description: 'Original uninterrupted CBS News television broadcasts from September 11, 2001.', year: '2001', genre: 'News Archive', episodes: cbsEps });
    if (cnnEps.length) shows.push({ id: 'show-911-cnn', title: 'CNN 9/11 Live Broadcasts', description: 'Original uninterrupted CNN television broadcasts from September 11, 2001.', year: '2001', genre: 'News Archive', episodes: cnnEps });
    if (bbcEps.length) shows.push({ id: 'show-911-bbc', title: 'BBC World News 9/11 Special Coverage', description: 'Original uninterrupted BBC World News television broadcasts from September 11, 2001.', year: '2001', genre: 'News Archive', episodes: bbcEps });
    if (foxEps.length) shows.push({ id: 'show-911-fox', title: 'Fox News 9/11 Live Coverage', description: 'Original uninterrupted Fox News Channel television broadcasts from September 11, 2001.', year: '2001', genre: 'News Archive', episodes: foxEps });
    if (otherEps.length) shows.push({ id: 'show-911-other', title: 'International & Special 9/11 Broadcast Archives', description: 'Special television archives and international news reports from September 11, 2001.', year: '2001', genre: 'News Archive', episodes: otherEps });

    return {
      id: 'ch-911-archive',
      number: '106',
      name: 'September 9/11 Archive Channel',
      tagline: 'Continuous Historic Television Coverage • September 11, 2001 Live Archives',
      category: 'News Archive',
      logoText: '9/11 ARCHIVE',
      accentColor: '#DC2626',
      shows
    };
  }

  const ch911 = await build911ArchiveChannel();

  // Scan local .m3u files
  const m3uFiles: { filePath: string; name: string }[] = [];
  const searchDirs = [path.join(process.cwd(), 'public'), path.join(process.cwd(), 'src', 'data')];

  searchDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        if ((file.endsWith('.m3u') || file.endsWith('.m3u8')) && !file.includes('911')) {
          m3uFiles.push({ filePath: path.join(dir, file), name: file });
        }
      });
    }
  });

  const m3uChannels: Channel[] = [ch911];
  let m3uChannelNumber = 107;

  m3uFiles.forEach(fileObj => {
    try {
      const content = fs.readFileSync(fileObj.filePath, 'utf8');
      const parsedChannels = parseM3U(content, fileObj.name);

      parsedChannels.forEach(ch => {
        ch.number = m3uChannelNumber.toString();
        m3uChannelNumber++;
        m3uChannels.push(ch);
      });
    } catch (err: any) {
      console.warn(`⚠️ Error parsing M3U file ${fileObj.name}:`, err.message);
    }
  });

  const newsFeeds = currentChannels.filter(c => ['ch-cnn', 'ch-fox', 'ch-rt', 'ch-dw', 'ch-bbc'].includes(c.id));

  const baseChannels: Channel[] = [
    westernsCh,
    crimeCh,
    comedyCh,
    newsArchiveCh,
    newsCurrentCh,
    ...m3uChannels,
    ...newsFeeds
  ];

  // Master Showcase (CH 108)
  const allMediaItems: Array<{
    id: string;
    title: string;
    url: string;
    durationMs?: number;
    runtimeMins?: number;
    subtitleUrl?: string;
    funFact?: string;
  }> = [];

  baseChannels.forEach(ch => {
    ch.shows.forEach(s => {
      s.episodes.forEach(ep => {
        allMediaItems.push({
          id: ep.id,
          title: ep.title,
          url: ep.url,
          durationMs: ep.durationMs || (ep.runtimeMins ? ep.runtimeMins * 60 * 1000 : 1800000),
          runtimeMins: ep.runtimeMins || 30,
          subtitleUrl: ep.subtitleUrl,
          funFact: ep.funFact
        });
      });
    });
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const shuffledMediaPool = getDeterministicDailySchedule(allMediaItems as any, todayStr);

  const masterShowcaseCh: Channel = {
    id: 'ch-master-shuffle',
    number: '108',
    name: 'Master Showcase (All Combined)',
    tagline: 'Unified Multi-Source Master Broadcast Shuffle',
    category: 'ALL',
    logoText: 'SHOWCASE',
    accentColor: '#F59E0B',
    shows: [
      {
        id: 'show-master-shuffle-stream',
        title: 'Master Combined TV Broadcast',
        description: 'All network series, westerns, crime thrillers, comedies, newsreels, and historic broadcasts unified in a deterministic daily schedule.',
        year: '2026',
        genre: 'Variety / Master Shuffle',
        episodes: shuffledMediaPool.map((item: any, idx: number) => ({
          id: `ep-master-${idx}-${item.id}`,
          title: item.title,
          url: item.url,
          durationMs: item.durationMs,
          runtimeMins: item.runtimeMins,
          subtitleUrl: item.subtitleUrl,
          funFact: item.funFact || 'Featured in Master Showcase Unified Stream.'
        }))
      }
    ]
  };

  const rawChannels: Channel[] = [
    westernsCh,
    crimeCh,
    comedyCh,
    newsArchiveCh,
    newsCurrentCh,
    masterShowcaseCh,
    ...m3uChannels,
    ...newsFeeds
  ];

  // Apply 24-hour round-robin rotation and commercial rule capping across ALL channels
  const allFinalChannels: Channel[] = rawChannels.map(ch => {
    const isNewsChannel = ['Archive News', 'Current Events', 'News', 'News Archive'].includes(ch.category) ||
                          ['ch-news-archive', 'ch-news-current', 'ch-911-archive'].includes(ch.id);
    return applyCommercialsAnd24hCap(ch, isNewsChannel, commercials);
  });

  const uniqueChannelsMap = new Map<string, Channel>();
  allFinalChannels.forEach(c => uniqueChannelsMap.set(c.id, c));
  const uniqueChannels = Array.from(uniqueChannelsMap.values()).sort((a, b) => parseInt(a.number, 10) - parseInt(b.number, 10));

  console.log(`✅ [Channel Generator]: Created ${uniqueChannels.length} total 24-Hour capped channels:`);
  uniqueChannels.forEach(c => {
    const epTotal = c.shows.reduce((acc, s) => acc + s.episodes.length, 0);
    console.log(`  - CH ${c.number} (${c.id}): "${c.name}" [Category: ${c.category}] - ${c.shows.length} show(s) / ${epTotal} total items in 24h schedule`);
  });

  rawDb.channels = uniqueChannels;
  fs.writeFileSync(DB_PATH, JSON.stringify(rawDb, null, 2), 'utf8');
  console.log(`💾 Updated ${DB_PATH}`);

  const playlistTsContent = `import { Channel } from "../types";

export const CHANNELS_DATA: Channel[] = ${JSON.stringify(uniqueChannels, null, 2)};
`;
  const playlistDir = path.dirname(PLAYLIST_TS_PATH);
  if (!fs.existsSync(playlistDir)) {
    fs.mkdirSync(playlistDir, { recursive: true });
  }
  fs.writeFileSync(PLAYLIST_TS_PATH, playlistTsContent, 'utf8');
  console.log(`💾 Updated ${PLAYLIST_TS_PATH}`);

  const serverDbDir = path.dirname(SERVER_DB_TS_PATH);
  if (!fs.existsSync(serverDbDir)) {
    fs.mkdirSync(serverDbDir, { recursive: true });
  }

  const serverDbTsContent = `import fs from 'fs';
import path from 'path';
import { Channel } from '../src/types';

const DB_PATH = path.join(process.cwd(), 'data', 'database.json');

export class LocalDatabase {
  private static readDb() {
    if (!fs.existsSync(DB_PATH)) {
      return {
        channels: [],
        scraperStatus: { isRunning: false, progress: 0, lastRun: null, currentTask: '' },
        scraperSettings: { intervalHours: 24, autoEnrich: true },
        scraperLogs: [],
        complianceLogs: [],
        telemetryLogs: []
      };
    }
    try {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch {
      return {
        channels: [],
        scraperStatus: { isRunning: false, progress: 0, lastRun: null, currentTask: '' },
        scraperSettings: { intervalHours: 24, autoEnrich: true },
        scraperLogs: [],
        complianceLogs: [],
        telemetryLogs: []
      };
    }
  }

  private static writeDb(data: any) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  }

  static getChannels(): Channel[] {
    const db = this.readDb();
    return db.channels || [];
  }

  static saveChannels(channels: Channel[]) {
    const db = this.readDb();
    db.channels = channels;
    this.writeDb(db);
    CHANNELS_DATA = channels;
  }

  static getScraperStatus() {
    const db = this.readDb();
    return db.scraperStatus || { isRunning: false, progress: 0, lastRun: null, currentTask: '' };
  }

  static updateScraperStatus(status: any) {
    const db = this.readDb();
    db.scraperStatus = { ...(db.scraperStatus || {}), ...status };
    this.writeDb(db);
  }

  static getScraperSettings() {
    const db = this.readDb();
    const defaults = {
      intervalHours: 24,
      pollingIntervalMins: 60,
      cronSchedule: '0 3 * * *',
      autoEnrich: true,
      enrichWithGemini: true,
      viewportWidth: 1920,
      viewportHeight: 1080,
      minDelayMs: 1000,
      maxDelayMs: 3000,
      targets: [
        'https://archive.org/download/daily-highlights/BIG%20WESTERN%20ZONE.m3u',
        'https://archive.org/download/daily-highlights/TV%20CRIME_cleaned.m3u'
      ]
    };
    return { ...defaults, ...(db.scraperSettings || {}) };
  }

  static saveScraperSettings(settings: any) {
    const db = this.readDb();
    db.scraperSettings = { ...(db.scraperSettings || {}), ...settings };
    this.writeDb(db);
  }

  static addScraperLog(msg: string) {
    const db = this.readDb();
    if (!db.scraperLogs) db.scraperLogs = [];
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    const logEntry = \`[\${timestamp}] \${msg}\`;
    db.scraperLogs.push(logEntry);
    if (db.scraperLogs.length > 500) {
      db.scraperLogs = db.scraperLogs.slice(-500);
    }
    this.writeDb(db);
  }

  static getScraperLogs(): string[] {
    const db = this.readDb();
    return db.scraperLogs || [];
  }

  static clearScraperLogs() {
    const db = this.readDb();
    db.scraperLogs = [];
    this.writeDb(db);
  }

  static addComplianceLog(action: string, details: string) {
    const db = this.readDb();
    if (!db.complianceLogs) db.complianceLogs = [];
    db.complianceLogs.push({
      timestamp: new Date().toISOString(),
      action,
      details
    });
    if (db.complianceLogs.length > 200) {
      db.complianceLogs = db.complianceLogs.slice(-200);
    }
    this.writeDb(db);
  }

  static getComplianceLogs(): any[] {
    const db = this.readDb();
    return db.complianceLogs || [];
  }

  static addTelemetryLog(log: any) {
    const db = this.readDb();
    if (!db.telemetryLogs) db.telemetryLogs = [];
    db.telemetryLogs.push({
      timestamp: new Date().toISOString(),
      ...log
    });
    if (db.telemetryLogs.length > 500) {
      db.telemetryLogs = db.telemetryLogs.slice(-500);
    }
    this.writeDb(db);
  }

  static getTelemetryLogs(): any[] {
    const db = this.readDb();
    return db.telemetryLogs || [];
  }

  static clearTelemetryLogs() {
    const db = this.readDb();
    db.telemetryLogs = [];
    this.writeDb(db);
  }

  static getStats() {
    const db = this.readDb();
    const channels = db.channels || [];
    let totalShows = 0;
    let totalEpisodes = 0;
    channels.forEach((ch: Channel) => {
      if (ch.shows) {
        totalShows += ch.shows.length;
        ch.shows.forEach(s => {
          if (s.episodes) totalEpisodes += s.episodes.length;
        });
      }
    });
    return {
      totalChannels: channels.length,
      totalShows,
      totalEpisodes,
      lastUpdated: db.scraperStatus?.lastRun || null
    };
  }

  static exportDatabase() {
    return this.readDb();
  }

  static importDatabase(data: any) {
    if (data && typeof data === 'object') {
      try {
        this.writeDb(data);
        if (Array.isArray(data.channels)) {
          CHANNELS_DATA = data.channels;
        }
        return { success: true, message: 'Database snapshot restored successfully.' };
      } catch (err: any) {
        return { success: false, message: err.message };
      }
    }
    return { success: false, message: 'Invalid payload: snapshot must be a JSON object.' };
  }
}

export let CHANNELS_DATA: Channel[] = LocalDatabase.getChannels();
`;
  fs.writeFileSync(SERVER_DB_TS_PATH, serverDbTsContent, 'utf8');
  console.log(`💾 Updated ${SERVER_DB_TS_PATH}`);

  writeDailyScheduleFiles(uniqueChannels);
  console.log(`📅 Re-exported static 24h JSON schedule manifests for all ${uniqueChannels.length} channels.`);
}

if (process.argv[1]?.includes('generate-channels.ts')) {
  generateAndRegisterChannels().catch(err => {
    console.error('❌ Channel generator error:', err);
    process.exit(1);
  });
}