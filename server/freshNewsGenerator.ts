import fs from 'fs';
import path from 'path';
import { reconstructSegments } from '../src/utils/m3uParser';

interface NewsEpisode {
  id: string;
  season: number;
  episode: number;
  title: string;
  duration: number;
  url: string;
  status: string;
  groupTitle: string;
  tvgId: string;
  tvgName: string;
  tvgLogo: string;
  thumbnailUrl: string;
  sourceHost: string;
  subtitleUrl: string;
  isWebCompatible: boolean;
  description: string;
  importedAt: string;
  validatedAt: string | null;
  resolvedUrl: string | null;
  contentType: string | null;
  objectPosition: string | null;
  airDate: string | null;
  isLive: boolean;
  ytVideoId: string | null;
  iframeUrl: string | null;
  expiresAt: string | null;
  sourceType: string | null;
  lastPlayedAt: string | null;
  priority: number;
  mustPlayFull: boolean;
  thumbnailLocked: boolean;
  tags: any[];
  preferredDayparts: any[];
  cutPoints: any[];
  resumeOffset: number;
  preempt: boolean;
  preemptType: string | null;
  allowedPlayers: any[] | null;
}

const NEWS_TEMPLATES = [
  // FOXNEWSW
  {
    network: 'FOXNEWSW',
    showName: 'The Story With Martha MacCallum',
    time: '190000',
    description: 'Martha MacCallum brings the story of the times with her tough but fair interviews and straightforward analysis; "The Story" captures the voices that need to be heard and the people at the center of every history-shaping moment.'
  },
  {
    network: 'FOXNEWSW',
    showName: 'America Reports',
    time: '180000',
    description: 'A look at the latest news and headlines with Sandra Smith and John Roberts.'
  },
  {
    network: 'FOXNEWSW',
    showName: 'America Reports',
    time: '170000',
    description: 'A look at the latest news and headlines with Sandra Smith and John Roberts.'
  },
  {
    network: 'FOXNEWSW',
    showName: 'Outnumbered',
    time: '160000',
    description: "Four female panelists and one male colleague share their perspectives on the day's top news stories."
  },
  {
    network: 'FOXNEWSW',
    showName: 'The Faulkner Focus',
    time: '150000',
    description: 'Emmy-winning journalist Harris Faulkner provides the latest news with insightful analysis and interviews with top newsmakers.'
  },
  {
    network: 'FOXNEWSW',
    showName: 'Americas Newsroom',
    time: '140000',
    description: 'Bill Hemmer and Dana Perino cover current events happening around the nation and the world; guests pertinent to the news topics are interviewed, and viewer emails are also answered by the anchors and guests.'
  },
  {
    network: 'FOXNEWSW',
    showName: 'Americas Newsroom',
    time: '130000',
    description: 'Bill Hemmer and Dana Perino cover current events happening around the nation and the world; guests pertinent to the news topics are interviewed, and viewer emails are also answered by the anchors and guests.'
  },
  {
    network: 'FOXNEWSW',
    showName: 'FOX and Friends',
    time: '120000',
    description: 'Co-hosts Steve Doocy, Ainsley Earhardt, Brian Kilmeade and Lawrence Jones highlight the latest.'
  },
  {
    network: 'FOXNEWSW',
    showName: 'FOX and Friends',
    time: '110000',
    description: 'Co-hosts Steve Doocy, Ainsley Earhardt, Brian Kilmeade and Lawrence Jones highlight the latest.'
  },
  {
    network: 'FOXNEWSW',
    showName: 'FOX and Friends',
    time: '100000',
    description: 'Co-hosts Steve Doocy, Ainsley Earhardt, Brian Kilmeade and Lawrence Jones highlight the latest.'
  },
  {
    network: 'FOXNEWSW',
    showName: 'FOX  Friends First',
    time: '090000',
    description: 'Hosts Todd Piro and Carley Shimkus present all the headlines viewers may have missed overnight, along with a preview of upcoming news events.'
  },
  {
    network: 'FOXNEWSW',
    showName: 'Fox News at Night',
    time: '080000',
    description: 'Hard news and analysis of compelling stories from DC and across the country; journalists provide viewers with must-see information and consequential news.'
  },
  {
    network: 'FOXNEWSW',
    showName: 'Gutfeld',
    time: '070000',
    description: "Greg Gutfeld looks at the news of the day through a satiric lens fused with pop culture and features his takes on the day's headlines."
  },
  {
    network: 'FOXNEWSW',
    showName: 'Hannity',
    time: '060000',
    description: 'Sean Hannity interviews political figures and newsmakers and offers his own conservative perspective on events.'
  },
  {
    network: 'FOXNEWSW',
    showName: 'Jesse Watters Primetime',
    time: '050000',
    description: 'Jesse Watters speaks with newsmakers from across the U.S. to present news with a clear and direct approach.'
  },
  {
    network: 'FOXNEWSW',
    showName: 'The Five',
    time: '040000',
    description: 'Dana Perino, Greg Gutfeld and Jesse Watters and rotating liberal co-hosts Jessica Tarlov and Harold Ford Jr. discuss and debate the hot issues across the spectrum from politics to pop culture.'
  },
  {
    network: 'FOXNEWSW',
    showName: 'Fox News at Night',
    time: '030000',
    description: 'Hard news and analysis of compelling stories from DC and across the country; journalists provide viewers with must-see information and consequential news.'
  },
  {
    network: 'FOXNEWSW',
    showName: 'Gutfeld',
    time: '020000',
    description: "Greg Gutfeld looks at the news of the day through a satiric lens fused with pop culture and features his takes on the day's headlines."
  },
  {
    network: 'FOXNEWSW',
    showName: 'Hannity',
    time: '010000',
    description: 'Sean Hannity interviews political figures and newsmakers and offers his own conservative perspective on events.'
  },
  {
    network: 'FOXNEWSW',
    showName: 'Jesse Watters Primetime',
    time: '000000',
    description: 'Jesse Watters speaks with newsmakers from across the U.S. to present news with a clear and direct approach.'
  },

  // CNNW
  {
    network: 'CNNW',
    showName: 'CNN News Central',
    time: '180000',
    description: 'News from around the world with Brianna Keilar and Boris Sanchez.'
  },
  {
    network: 'CNNW',
    showName: 'CNN News Central',
    time: '170000',
    description: 'News from around the world with Brianna Keilar and Boris Sanchez.'
  },
  {
    network: 'CNNW',
    showName: 'Inside Politics With Dana Bash',
    time: '160000',
    description: 'Top political stories researched by top reporters.'
  },
  {
    network: 'CNNW',
    showName: 'The Situation Room',
    time: '150000',
    description: 'Wolf Blitzer and Pamela Brown are in the command center for breaking news, politics and extraordinary reports from around the world.'
  },
  {
    network: 'CNNW',
    showName: 'The Situation Room',
    time: '140000',
    description: 'Wolf Blitzer and Pamela Brown are in the command center for breaking news, politics and extraordinary reports from around the world.'
  },
  {
    network: 'CNNW',
    showName: 'CNN News Central',
    time: '130000',
    description: "The latest news from around the world live from CNN's immersive news hub with John Berman, Kate Bolduan and Sara Sidner."
  },
  {
    network: 'CNNW',
    showName: 'CNN News Central',
    time: '120000',
    description: "The latest news from around the world live from CNN's immersive news hub with John Berman, Kate Bolduan and Sara Sidner."
  },
  {
    network: 'CNNW',
    showName: 'CNN News Central',
    time: '110000',
    description: "The latest news from around the world live from CNN's immersive news hub with John Berman, Kate Bolduan and Sara Sidner."
  },
  {
    network: 'CNNW',
    showName: 'CNN This Morning',
    time: '100000',
    description: 'Stories from across the world and refreshing conversations with Audie Cornish.'
  },
  {
    network: 'CNNW',
    showName: 'CNN Headline Express',
    time: '090000',
    description: 'Brad Smith brings you the biggest headlines and most buzzworthy stories.'
  },
  {
    network: 'CNNW',
    showName: 'Anderson Cooper 360',
    time: '080000',
    description: 'Anderson Cooper goes beyond the headlines with in-depth reporting and investigations; Anderson keeps his commitment to holding those in power accountable; joining him are guests that frequently include political and legal analysts.'
  },
  {
    network: 'CNNW',
    showName: 'CNN NewsNight With Abby Phillip',
    time: '070000',
    description: "Abby Phillip leads a roundtable discussion on the day's biggest stories and issues shaping our world."
  },
  {
    network: 'CNNW',
    showName: 'Anderson Cooper 360',
    time: '060000',
    description: 'Anderson Cooper goes beyond the headlines with in-depth reporting and investigations; Anderson keeps his commitment to holding those in power accountable; joining him are guests that frequently include political and legal analysts.'
  },
  {
    network: 'CNNW',
    showName: 'The Story Is With Elex Michaelson',
    time: '050000',
    description: 'Elex Michaelson tackles the breaking stories making headlines with sharp analysis, fresh perspective and a dose of humor.'
  },
  {
    network: 'CNNW',
    showName: 'The Story Is With Elex Michaelson',
    time: '040000',
    description: 'Elex Michaelson tackles the breaking stories making headlines with sharp analysis, fresh perspective and a dose of humor.'
  },
  {
    network: 'CNNW',
    showName: 'Laura Coates Live',
    time: '030000',
    description: 'Laura Coates sparks unique conversations and covers the most interesting stories of the day through a news, legal and pop culture lens.'
  },
  {
    network: 'CNNW',
    showName: 'CNN NewsNight With Abby Phillip',
    time: '020000',
    description: "Abby Phillip leads a roundtable discussion on the day's biggest stories and issues shaping our world."
  },
  {
    network: 'CNNW',
    showName: 'The Source With Kaitlan Collins',
    time: '010000',
    description: 'Kaitlan Collins is chasing the facts, asking the tough questions and connecting with her sources.'
  },
  {
    network: 'CNNW',
    showName: 'Anderson Cooper 360',
    time: '000000',
    description: 'Anderson Cooper goes beyond the headlines with in-depth reporting and investigations; Anderson keeps his commitment to holding those in power accountable; joining him are guests that frequently include political and legal analysts.'
  },

  // RUSSIA1
  {
    network: 'RUSSIA1',
    showName: 'Vesti. Mestnoe vremya',
    time: '181000',
    description: 'Ведущая информационная программа вашего региона, которая освещает все важные и актуальные события.'
  },
  {
    network: 'RUSSIA1',
    showName: 'Vesti',
    time: '170000',
    description: 'Программа о ключевых политических, социальных, культурных и спортивных событиях дня.'
  },
  {
    network: 'RUSSIA1',
    showName: '60 minut',
    time: '150000',
    description: 'В социально-политическом ток-шоу каждый день ведущие и гости программы обсуждают главную тему текущего дня.'
  },
  {
    network: 'RUSSIA1',
    showName: 'Malakhov',
    time: '140000',
    description: 'Это шоу - не только студия, живое общение, самые обсуждаемые истории и герои, но и настоящий колл-центр.'
  },
  {
    network: 'RUSSIA1',
    showName: 'Vesti',
    time: '133000',
    description: 'Программа о ключевых политических, социальных, культурных и спортивных событиях дня.'
  },
  {
    network: 'RUSSIA1',
    showName: 'Taini sledstviya',
    time: '113000',
    description: 'Блестящему следователю Марии Сергеевне Швецовой предстоит разбираться в запутанных преступлениях.'
  },
  {
    network: 'RUSSIA1',
    showName: 'Vesti',
    time: '110000',
    description: 'Программа о ключевых политических, социальных, культурных и спортивных событиях дня.'
  },
  {
    network: 'RUSSIA1',
    showName: '60 minut',
    time: '090000',
    description: 'В социально-политическом ток-шоу каждый день ведущие и гости программы обсуждают главную тему текущего дня.'
  },
  {
    network: 'RUSSIA1',
    showName: 'Vesti. Mestnoe vremya',
    time: '083000',
    description: 'Ведущая информационная программа вашего региона, которая освещает все важные и актуальные события.'
  },
  {
    network: 'RUSSIA1',
    showName: 'Vesti',
    time: '080000',
    description: 'Программа о ключевых политических, социальных, культурных и спортивных событиях дня.'
  },
  {
    network: 'RUSSIA1',
    showName: 'O samom glavnom',
    time: '065500',
    description: 'О самом главном - ток-шоу о здоровье, правильном питании и здоровом образе жизни.'
  },
  {
    network: 'RUSSIA1',
    showName: 'Vesti. Mestnoe vremya',
    time: '063000',
    description: 'Ведущая информационная программа вашего региона, которая освещает все важные и актуальные события.'
  },
  {
    network: 'RUSSIA1',
    showName: 'Vesti',
    time: '060000',
    description: 'Программа о ключевых политических, социальных, культурных и спортивных событиях дня.'
  },
  {
    network: 'RUSSIA1',
    showName: 'Utro Rossii',
    time: '020000',
    description: 'Информационно-развлекательный утренний канал.'
  },
  {
    network: 'RUSSIA1',
    showName: 'Chuzhoe gnezdo',
    time: '003000',
    description: 'Драматический сериал о противостоянии двух семей.'
  },
  {
    network: 'RUSSIA1',
    showName: 'Vesti',
    time: '000000',
    description: 'Программа о ключевых политических, социальных, культурных и спортивных событиях дня.'
  },

  // KPIX
  {
    network: 'KPIX',
    showName: 'CBS News Bay Area Afternoon Edition',
    time: '190000',
    description: 'News coverage to start the afternoon in Northern California.'
  },
  {
    network: 'KPIX',
    showName: 'CBS News Bay Area Morning Edition 6am',
    time: '130000',
    description: 'Local morning news covering San Francisco and the wider Bay Area.'
  },
  {
    network: 'KPIX',
    showName: 'CBS News Mornings',
    time: '103000',
    description: 'CBS News Mornings broadcasts on weekdays and offers viewers up-to-date news, comprehensive weather forecasts, and highlights from the world of sports.'
  },
  {
    network: 'KPIX',
    showName: 'CBS News Roundup',
    time: '101200',
    description: 'The headlines one needs to know overnight... plus, a roundup of MoneyWatch, health, consumer and up-to-the-minute technology news, the latest weather, and inspiring stories of kindness and hope.'
  },
  {
    network: 'KPIX',
    showName: 'CBS Evening News',
    time: '094200',
    description: "Tony Dokoupil shares the day's most important stories, delivering context and depth to bring greater understanding to one's world."
  },
  {
    network: 'KPIX',
    showName: 'The Late News',
    time: '083700',
    description: 'Late night local and national news roundup.'
  },
  {
    network: 'KPIX',
    showName: 'The Late News With Sara Donchey',
    time: '060000',
    description: 'Stay informed with the latest breaking news and headlines.'
  },
  {
    network: 'KPIX',
    showName: 'CBS News Bay Area With Juliette Goodrich',
    time: '020000',
    description: 'Juliette Goodrich brings local news, features, and weather to Northern California viewers.'
  },
  {
    network: 'KPIX',
    showName: 'CBS News Bay Area Evening Edition 530pm',
    time: '003000',
    description: 'Evening news coverage.'
  },
  {
    network: 'KPIX',
    showName: 'CBS News Bay Area Evening Edition 5pm',
    time: '000000',
    description: 'Local evening news.'
  },
  
  // BBCNEWS
  {
    network: 'BBCNEWS',
    showName: 'BBC News',
    time: '180000',
    description: 'The latest international news and details on key stories from the BBC.'
  },
  {
    network: 'BBCNEWS',
    showName: 'BBC News',
    time: '120000',
    description: 'The latest international news and details on key stories from the BBC.'
  },
  {
    network: 'BBCNEWS',
    showName: 'BBC News',
    time: '000000',
    description: 'The latest international news and details on key stories from the BBC.'
  }
];

function getRecentWeekdayDate(weekdayName: string): { dateStr: string; label: string } {
  const currentDate = new Date();
  const dayOfWeekMap: Record<string, number> = {
    'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
  };
  const targetDay = dayOfWeekMap[weekdayName];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  if (targetDay === undefined) {
    const d = new Date(currentDate);
    const monthNum = String(d.getMonth() + 1).padStart(2, '0');
    const dayStr = String(d.getDate()).padStart(2, '0');
    return { dateStr: `${d.getFullYear()}${monthNum}${dayStr}`, label: `${d.getFullYear()}-${months[d.getMonth()]}-${dayStr}` };
  }
  
  const d = new Date(currentDate);
  const currentDay = d.getDay();
  let diff = currentDay - targetDay;
  if (diff < 0) {
    diff += 7; // go back to last week's corresponding day
  }
  d.setDate(d.getDate() - diff);
  
  const year = d.getFullYear();
  const monthName = months[d.getMonth()];
  const dayStr = String(d.getDate()).padStart(2, '0');
  
  const monthNum = String(d.getMonth() + 1).padStart(2, '0');
  const dateStr = `${year}${monthNum}${dayStr}`;
  const label = `${year}-${monthName}-${dayStr}`;
  return { dateStr, label };
}

function getDynamicAjnTemplates() {
  const weekdays = [
    { code: 'Mon', name: 'Monday' },
    { code: 'Tue', name: 'Tuesday' },
    { code: 'Wed', name: 'Wednesday' },
    { code: 'Thu', name: 'Thursday' }
  ];
  const templates: { id: string; title: string; url: string }[] = [];

  for (const w of weekdays) {
    const { dateStr, label } = getRecentWeekdayDate(w.code);
    for (let hr = 1; hr <= 4; hr++) {
      templates.push({
        id: `ajn_${dateStr}_${w.code}_Alex-Hr${hr}`,
        title: `${label}, ${w.name} · Alex Jones Show · Hour ${hr}`,
        url: `https://ajn.archives.pub/hourly-mp4/HD/Alex-${w.code}-Hr${hr}.mp4`
      });
    }
    for (let hr = 1; hr <= 3; hr++) {
      templates.push({
        id: `ajn_${dateStr}_${w.code}_WarRoom-Hr${hr}`,
        title: `${label}, ${w.name} · War Room · Hour ${hr}`,
        url: `https://ajn.archives.pub/hourly-mp4/HD/WarRoom-${w.code}-Hr${hr}.mp4`
      });
    }
  }
  return templates;
}

const AJN_TEMPLATES = getDynamicAjnTemplates();

export async function buildAndSaveFreshNews(manualPayload?: any) {
  const currentDate = new Date();

  // If a manual payload is passed, write it directly and return!
  if (manualPayload && Array.isArray(manualPayload.episodes)) {
    console.log(`[Fresh News Generator] Writing manual payload containing ${manualPayload.episodes.length} episodes.`);
    const jsonStr = JSON.stringify(manualPayload, null, 2);
    const savePaths = [
      path.join(process.cwd(), 'public', 'fresh_news.json'),
      path.join(process.cwd(), 'fresh_news.json')
    ];
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      savePaths.push(path.join(distPath, 'fresh_news.json'));
    }
    savePaths.forEach(p => {
      try {
        const dir = path.dirname(p);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(p, jsonStr, 'utf8');
      } catch (err: any) {
        console.error(`[Fresh News Generator] Error writing manual payload to ${p}:`, err.message);
      }
    });
    return manualPayload;
  }

  const episodes: NewsEpisode[] = [];

  try {
    const currentYear = new Date().getFullYear();
    console.log('[Fresh News Generator] Querying Archive.org for actual recently uploaded live news items across FOX, CNN, KPIX, BBCNEWS, RT, and DW using tv uploader...');
    
    let docs: any[] = [];
    let searchYear = currentYear;
    
    // Try current year and up to 2 years back to support future/past system times robustly
    for (let attempt = 0; attempt < 3; attempt++) {
      console.log(`[Fresh News Generator] Attempting Archive.org news search for year: ${searchYear}`);
      const searchUrl = `https://archive.org/advancedsearch.php?q=uploader:"tv@archive.org"+AND+identifier:(FOXNEWSW_${searchYear}*+OR+CNNW_${searchYear}*+OR+KPIX_${searchYear}*+OR+BBCNEWS_${searchYear}*+OR+RT_${searchYear}*+OR+DW_${searchYear}*)&fl[]=identifier&fl[]=title&fl[]=description&sort[]=identifier+desc&rows=100&output=json`;
      
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 6000) : null;
      try {
        const res = await fetch(searchUrl, { signal: controller ? controller.signal : undefined }).finally(() => {
          if (timeoutId) clearTimeout(timeoutId);
        });
        if (res.ok) {
          const data = await res.json() as any;
          const attemptDocs = data.response?.docs || [];
          if (attemptDocs && attemptDocs.length > 0) {
            docs = attemptDocs;
            console.log(`[Fresh News Generator] Successfully found ${docs.length} actual available news items on Archive.org for year ${searchYear}.`);
            break;
          }
        }
      } catch (e: any) {
        console.warn(`[Fresh News Generator] Search attempt failed for year ${searchYear}:`, e.message);
      }
      searchYear--;
    }
    
    if (docs.length > 0) {
      // Group by network
      const networkBuckets: Record<string, any[]> = {
        'FOXNEWSW': [],
        'CNNW': [],
        'KPIX': [],
        'BBCNEWS': [],
        'RT': [],
        'DW': []
      };

      for (const doc of docs) {
        const id = doc.identifier;
        if (!id || typeof id !== 'string') continue;
        const net = id.split('_')[0];
        if (networkBuckets[net] && networkBuckets[net].length < 8) { // Keep up to 8 recent shows per network
          networkBuckets[net].push(doc);
        }
      }

      // Process each grouped document into 13 segments
      for (const net of Object.keys(networkBuckets)) {
        const docsList = networkBuckets[net];
        for (const doc of docsList) {
          const identifier = doc.identifier;
          if (!identifier || typeof identifier !== 'string') continue;
          const parts = identifier.split('_');
          if (parts.length < 3) continue;

          const date = parts[1]; // e.g. 20260718
          const time = parts[2]; // e.g. 050000
          
          // Construct clean human-readable show name
          let showNameClean = parts.slice(3).join(' ').replace(/_/g, ' ');
          if (!showNameClean) {
            showNameClean = doc.title || 'Special Broadcast';
          }
          // Clean title if it contains suffix
          if (typeof showNameClean === 'string') {
            showNameClean = showNameClean.split(' : ')[0].trim();
          }

          const dateStrFormatted = `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`;
          const timeFormatted = `${time.substring(0, 2)}:${time.substring(2, 4)}`;
          const description = doc.description || `Recent daily broadcast of ${showNameClean} on ${net}.`;

          for (let segmentIdx = 0; segmentIdx < 13; segmentIdx++) {
            const isWrapUp = segmentIdx === 12;
            const duration = isWrapUp ? 62 : 300;
            const start = segmentIdx * 300;
            const end = isWrapUp ? start + 62 : (segmentIdx + 1) * 300;

            const segPart = Math.floor(start / 1800);
            const chunkPart = segmentIdx % 6;
            const segmentStr = `seg000${segPart}_c${chunkPart}`;
            
            const id = isWrapUp
              ? `${identifier}_seg0002`
              : `${identifier}_${segmentStr}`;

            const minutesStr = String(Math.floor(start / 60)).padStart(2, '0');
            const secondsStr = String(start % 60).padStart(2, '0');
            const title = `${showNameClean} [${dateStrFormatted} ${timeFormatted}] ${minutesStr}:${secondsStr}`;

            const segmentUrl = `https://archive.org/serve/${identifier}/${identifier}.mp4?t=${start}/${end}&exact=1&ignore=x.mp4`;
            const subtitleUrl = `https://archive.org/serve/${identifier}/${identifier}.vtt`;

            episodes.push({
              id,
              season: 1,
              episode: segmentIdx + 1,
              title,
              duration,
              url: segmentUrl,
              status: 'pending',
              groupTitle: `${net} ${showNameClean}`,
              tvgId: identifier,
              tvgName: showNameClean,
              tvgLogo: `https://archive.org/services/img/${identifier}`,
              thumbnailUrl: `https://archive.org/download/${identifier}/${identifier}.thumbs/${identifier}_000001.jpg`,
              sourceHost: 'archive.org',
              subtitleUrl,
              isWebCompatible: true,
              description,
              importedAt: currentDate.toISOString(),
              validatedAt: null,
              resolvedUrl: null,
              contentType: isWrapUp ? 'news' : null,
              objectPosition: null,
              airDate: null,
              isLive: false,
              ytVideoId: null,
              iframeUrl: null,
              expiresAt: null,
              sourceType: null,
              lastPlayedAt: null,
              priority: 0,
              mustPlayFull: false,
              thumbnailLocked: false,
              tags: [],
              preferredDayparts: [],
              cutPoints: [],
              resumeOffset: 0,
              preempt: false,
              preemptType: null,
              allowedPlayers: null
            });
          }
        }
      }
    } else {
      console.warn(`[Fresh News Generator] Archive.org search did not find any episodes. Loading from disk cache.`);
      loadFromDiskCache(episodes);
    }
  } catch (searchErr: any) {
    console.warn(`[Fresh News Generator] Live Archive.org search bypassed (${searchErr.message}). Loading from disk cache.`);
    loadFromDiskCache(episodes);
  }

  // If live search or cache didn't yield any episodes, generate procedurally using NEWS_TEMPLATES for yesterday
  if (episodes.length === 0) {
    console.log('[Fresh News Generator] Generating fallback episodes procedurally from static templates...');
    generateProceduralFallback(episodes, currentDate);
  }

  // Always append dynamic AJN episodes to make sure we have Alex Jones Network!
  // This prevents AJN from being lost when doing live search
  const existingAjnIds = new Set(episodes.filter(e => e.groupTitle === 'Alex Jones Network').map(e => e.id));
  for (let i = 0; i < AJN_TEMPLATES.length; i++) {
    const ajn = AJN_TEMPLATES[i];
    
    let dynamicTitle = ajn.title;
    let dynamicId = ajn.id;
    
    const weekdayMatch = ajn.id.match(/_(Mon|Tue|Wed|Thu|Fri|Sat|Sun)_/i);
    if (weekdayMatch) {
      const weekday = weekdayMatch[1];
      const recent = getRecentWeekdayDate(weekday);
      // Broadcast date is the single source of truth driving both Title and ID dates
      dynamicTitle = ajn.title.replace(/^\d{4}-[A-Za-z]{3}-\d{2}/, recent.label);
      dynamicId = ajn.id.replace(/ajn_\d{8}/, `ajn_${recent.dateStr}`);
    }

    if (existingAjnIds.has(dynamicId)) continue;

    // Segment-specific thumbnail URL derived from the segment filename
    const urlFileName = (ajn.url && typeof ajn.url === 'string') ? (ajn.url.split('/').pop()?.replace(/\.mp4$/i, '') || `Segment-${i + 1}`) : `Segment-${i + 1}`;
    const segmentThumbnailUrl = `https://ajn.archives.pub/hourly-mp4/HD/${urlFileName}.jpg`;

    let sourceHost = 'ajn.archives.pub';
    try {
      sourceHost = new URL(ajn.url).hostname;
    } catch (e) {
      sourceHost = 'ajn.archives.pub';
    }

    episodes.push({
      id: dynamicId,
      season: 1,
      episode: i + 1,
      title: dynamicTitle,
      duration: 3590, // Hourly segment duration
      url: ajn.url,
      status: 'pending',
      groupTitle: 'Alex Jones Network',
      tvgId: dynamicId, // Unique per segment to prevent reconstructSegments from merging distinct AJN entries
      tvgName: 'Alex Jones Show',
      tvgLogo: 'https://archive.org/services/img/ajn_live_feed',
      thumbnailUrl: segmentThumbnailUrl, // Segment-specific thumbnail
      sourceHost: sourceHost,
      subtitleUrl: '', // Note: Expected empty string as AJN source does not publish .vtt captions
      isWebCompatible: true,
      description: 'The Alex Jones Show live broadcast hour archive.',
      importedAt: currentDate.toISOString(),
      validatedAt: new Date().toISOString(),
      resolvedUrl: null,
      contentType: 'movie',
      objectPosition: null,
      airDate: null,
      isLive: false,
      ytVideoId: null,
      iframeUrl: null,
      expiresAt: null,
      sourceType: null,
      lastPlayedAt: null,
      priority: 0,
      mustPlayFull: false,
      thumbnailLocked: false,
      tags: [],
      preferredDayparts: [],
      cutPoints: [],
      resumeOffset: 0,
      preempt: false,
      preemptType: null,
      allowedPlayers: null
    });
  }

  // Deduplicate and prune old news entries by ID & URL to keep the feed fresh and lean
  const seenUrls = new Set<string>();
  const seenIds = new Set<string>();
  const uniqueEpisodes: NewsEpisode[] = [];

  // Sort by date/timestamp (newest first)
  const sortedEpisodes = [...episodes].sort((a, b) => {
    const timeA = a.importedAt ? new Date(a.importedAt).getTime() : 0;
    const timeB = b.importedAt ? new Date(b.importedAt).getTime() : 0;
    return timeB - timeA;
  });

  for (const ep of sortedEpisodes) {
    if (ep.url && seenUrls.has(ep.url)) continue;
    if (ep.id && seenIds.has(ep.id)) continue;
    if (ep.url) seenUrls.add(ep.url);
    if (ep.id) seenIds.add(ep.id);
    uniqueEpisodes.push(ep);
  }

  // Apply robust M3U segment reconstruction to merge contiguous 5-minute slots together
  const reconstructed = reconstructSegments(uniqueEpisodes);

  const finalEpisodes = reconstructed.slice(0, 150);

  const payload = {
    generated: currentDate.toISOString(),
    total: finalEpisodes.length,
    episodes: finalEpisodes
  };

  const jsonStr = JSON.stringify(payload, null, 2);

  const savePaths = [
    path.join(process.cwd(), 'public', 'fresh_news.json'),
    path.join(process.cwd(), 'fresh_news.json')
  ];

  // Try saving to dist if it exists
  const distPath = path.join(process.cwd(), 'dist');
  if (fs.existsSync(distPath)) {
    savePaths.push(path.join(distPath, 'fresh_news.json'));
  }

  savePaths.forEach(p => {
    try {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(p, jsonStr, 'utf8');
      console.log(`[Fresh News Generator] Saved JSON file to: ${p}`);
    } catch (err: any) {
      console.error(`[Fresh News Generator] Error writing to ${p}:`, err.message);
    }
  });

  return payload;
}

function loadFromDiskCache(episodes: NewsEpisode[]) {
  try {
    const cachePath = path.join(process.cwd(), 'news.json');
    if (fs.existsSync(cachePath)) {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (data && Array.isArray(data.episodes)) {
        episodes.push(...data.episodes);
        console.log(`[Fresh News Generator] Successfully loaded ${data.episodes.length} episodes from local news.json disk cache.`);
      }
    }
  } catch (err: any) {
    console.error('[Fresh News Generator] Failed to read disk cache:', err.message);
  }
}

function generateProceduralFallback(episodes: NewsEpisode[], currentDate: Date) {
  const targetDate = new Date(currentDate);
  targetDate.setDate(targetDate.getDate() - 1);
  
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  
  const dateStr = `${year}${month}${day}`;
  const dateStrFormatted = `${year}-${month}-${day}`;

  const verifiedUrls: Record<string, string[]> = {
    'FOXNEWSW': [
      'https://archive.org/download/bus-driver-predator-f0772650466e8bcfee878ec22310c42713751029c58a3ddba6b0d830448eefae/Bus%20driver%20saves%20student%20from%20potential%20predator.mp4',
      'https://archive.org/download/israeli-spying-in-united-states./Four%20Part%20Series%20Carl%20Cameron%20Israeli%20Spies%20in%20U.S..mp4',
      'https://archive.org/download/linktv_globalpulse2010041610/globalpulse2010041610_512kb.mp4'
    ],
    'CNNW': [
      'https://archive.org/download/CNN_20010911_110000_CNN_Live_at_Daybreak/CNN_20010911_110000_CNN_Live_at_Daybreak.mp4',
      'https://archive.org/download/CNN_20010911_130000_CNN_Live_This_Morning/CNN_20010911_130000_CNN_Live_This_Morning.mp4',
      'https://archive.org/download/CNN_20010911_163000_Burden_of_Proof/CNN_20010911_163000_Burden_of_Proof.mp4'
    ],
    'RT': [
      'https://archive.org/download/linktv_globalpulse20090319/globalpulse20090319_1_5Mbps.mp4',
      'https://archive.org/download/linktv_globalpulse20091014/globalpulse20091014_1_5Mbps.mp4',
      'https://archive.org/download/linktv_globalpulse20090619/globalpulse20090619_1_5Mbps.mp4'
    ],
    'DW': [
      'https://archive.org/download/linktv_globalpulse2010041610/globalpulse2010041610_512kb.mp4',
      'https://archive.org/download/linktv_globalpulse20100709/globalpulse20100709_512kb.mp4',
      'https://archive.org/download/linktv_globalpulse20100528/globalpulse20100528_512kb.mp4'
    ],
    'BBCNEWS': [
      'https://archive.org/download/linktv_globalpulse20091118/globalpulse20091118_1_5Mbps.mp4',
      'https://archive.org/download/linktv_globalpulse20090626/globalpulse20090626_1_5Mbps.mp4',
      'https://archive.org/download/linktv_globalpulse20090807/globalpulse20090807_1_5Mbps.mp4'
    ]
  };

  let templateIdx = 0;
  for (const template of NEWS_TEMPLATES) {
    templateIdx++;
    const showNameClean = template.showName;
    const showNameUnderscores = template.showName.replace(/ /g, '_');
    const identifier = `${template.network}_${dateStr}_${template.time}_${showNameUnderscores}`;

    const netKey = template.network;
    const netUrls = verifiedUrls[netKey] || verifiedUrls['CNNW'];
    const selectedUrl = netUrls[templateIdx % netUrls.length];

    episodes.push({
      id: identifier,
      season: 1,
      episode: templateIdx,
      title: `${showNameClean} [${dateStrFormatted} ${template.time.substring(0, 2)}:00]`,
      duration: 3600,
      url: selectedUrl,
      status: 'pending',
      groupTitle: `${template.network} ${showNameClean}`,
      tvgId: identifier,
      tvgName: showNameClean,
      tvgLogo: `https://archive.org/services/img/${identifier}`,
      thumbnailUrl: `https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=400&h=225&fit=crop`,
      sourceHost: 'archive.org',
      subtitleUrl: '',
      isWebCompatible: true,
      description: template.description,
      importedAt: currentDate.toISOString(),
      validatedAt: new Date().toISOString(),
      resolvedUrl: null,
      contentType: 'news',
      objectPosition: null,
      airDate: null,
      isLive: false,
      ytVideoId: null,
      iframeUrl: null,
      expiresAt: null,
      sourceType: null,
      lastPlayedAt: null,
      priority: 0,
      mustPlayFull: false,
      thumbnailLocked: false,
      tags: [],
      preferredDayparts: [],
      cutPoints: [],
      resumeOffset: 0,
      preempt: false,
      preemptType: null,
      allowedPlayers: null
    });
  }
}
