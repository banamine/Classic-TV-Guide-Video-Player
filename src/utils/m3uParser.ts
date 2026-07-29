/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Channel, Show, Episode } from '../types';

export function getArchiveStart(url: string): number | null {
  if (!url) return null;
  const startMatch = url.match(/[?&]start=(\d+)/);
  if (startMatch) return parseInt(startMatch[1], 10);
  const tMatch = url.match(/[?&]t=(\d+)/);
  if (tMatch) return parseInt(tMatch[1], 10);
  return null;
}

export function getArchiveEnd(url: string, duration: number = 0): number | null {
  if (!url) return null;
  const endMatch = url.match(/[?&]end=(\d+)/);
  if (endMatch) return parseInt(endMatch[1], 10);
  const tRangeMatch = url.match(/[?&]t=\d+\/(\d+)/);
  if (tRangeMatch) return parseInt(tRangeMatch[1], 10);
  const start = getArchiveStart(url);
  if (start !== null && duration > 0) {
    return start + duration;
  }
  return null;
}

export function classifyContentType(title: string, groupTitle: string): string {
  const combined = `${title} ${groupTitle}`.toLowerCase();
  if (combined.includes('commercial') || combined.includes('advertisement') || combined.includes('adbreak')) {
    return 'commercial';
  }
  if (combined.includes('weather') || combined.includes('forecast')) {
    return 'weather';
  }
  if (combined.includes('news') || combined.includes('newscast') || combined.includes('headline')) {
    return 'news';
  }
  if (combined.includes('movie') || combined.includes('film') || combined.includes('cinema')) {
    return 'movie';
  }
  return 'special';
}

export function remasterHeadline(title: string): string {
  // Strip segment timestamps like "00:00" or " 05:00" or " 12:30" from the end
  let clean = title.replace(/\s+\d{2}:\d{2}\s*$/, '');
  // Clean double spaces
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean;
}

export function enrichMissingDurations<T extends { url: string; duration?: number; durationMs?: number }>(episodes: T[]): T[] {
  return episodes.map(ep => {
    let dur = ep.duration || (ep.durationMs ? ep.durationMs / 1000 : 0);
    if (!dur || dur <= 0) {
      const start = getArchiveStart(ep.url);
      const end = getArchiveEnd(ep.url, 0);
      if (start !== null && end !== null && end > start) {
        dur = end - start;
      } else {
        dur = 300; // default 5 mins
      }
    }
    const updated = { ...ep };
    if ('duration' in ep || !('durationMs' in ep)) {
      (updated as any).duration = dur;
    }
    if ('durationMs' in ep) {
      (updated as any).durationMs = dur * 1000;
    }
    return updated;
  });
}

export function reconstructSegments<T extends { title: string; url: string; duration?: number; durationMs?: number; groupTitle?: string; tvgId?: string; tvgName?: string; subtitleUrl?: string }>(raw: T[]): T[] {
  if (raw.length === 0) return [];

  // Sanity bound check prior to segment reconstruction:
  // Reject / cap duration outliers (> 7200s) on hourly segments (e.g. AJN or tagged "Hour N")
  for (const ep of raw) {
    const isHourlySegment = ep.groupTitle === 'Alex Jones Network' || /Hour\s*\d+/i.test(ep.title || '');
    if (isHourlySegment && ep.duration && ep.duration > 7200) {
      console.warn(`[Sanity Bound] Flagged duration outlier (${ep.duration}s) on hourly segment "${ep.title}". Restoring standard hourly duration (3590s).`);
      ep.duration = 3590;
      if ('durationMs' in ep) (ep as any).durationMs = 3590000;
    }
  }

  // 1. Enrich missing durations first
  const enriched = enrichMissingDurations(raw);

  // 2. Group by (title + groupTitle) or tvgId
  const groups: Record<string, T[]> = {};
  const groupKeys: string[] = [];

  for (const ep of enriched) {
    const baseTitle = (ep.tvgName || ep.title || '').replace(/\s*\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\]\s*\d{2}:\d{2}/g, '').trim();
    const key = ep.tvgId || `${baseTitle}__${ep.groupTitle || ''}`;
    if (!groups[key]) {
      groups[key] = [];
      groupKeys.push(key);
    }
    groups[key].push(ep);
  }

  const reconstructed: T[] = [];

  for (const key of groupKeys) {
    const list = groups[key];
    if (list.length === 0) continue;

    // Sort by start offset
    list.sort((a, b) => {
      const startA = getArchiveStart(a.url) ?? 0;
      const startB = getArchiveStart(b.url) ?? 0;
      return startA - startB;
    });

    let merged: T[] = [];
    let current = list[0];

    for (let i = 1; i < list.length; i++) {
      const next = list[i];

      const currentIsArchive = current.url.includes('archive.org/');
      const nextIsArchive = next.url.includes('archive.org/');

      let isAdjacent = false;

      if (currentIsArchive && nextIsArchive) {
        const curDur = current.duration || (current.durationMs ? current.durationMs / 1000 : 0);
        const currentEnd = getArchiveEnd(current.url, curDur);
        const nextStart = getArchiveStart(next.url);

        if (currentEnd !== null && nextStart !== null) {
          if (Math.abs(nextStart - currentEnd) <= 10) {
            isAdjacent = true;
          }
        } else {
          isAdjacent = true;
        }
      } else {
        isAdjacent = true;
      }

      if (isAdjacent) {
        // Sum durations
        const curDur = current.duration || (current.durationMs ? current.durationMs / 1000 : 0);
        const nextDur = next.duration || (next.durationMs ? next.durationMs / 1000 : 0);
        const totalDur = curDur + nextDur;

        // Form merged URL
        let mergedUrl = current.url;
        const currentStart = getArchiveStart(current.url);
        const nextEnd = getArchiveEnd(next.url, nextDur);

        if (currentIsArchive && currentStart !== null && nextEnd !== null) {
          if (current.url.includes('?t=') || current.url.includes('&t=')) {
            mergedUrl = current.url.replace(/([?&]t=)\d+\/\d+/, `$1${currentStart}/${nextEnd}`);
          } else if (current.url.includes('?start=') || current.url.includes('&start=')) {
            mergedUrl = current.url
              .replace(/([?&]start=)\d+/, `$1${currentStart}`)
              .replace(/([?&]end=)\d+/, `$1${nextEnd}`);
          } else {
            const separator = current.url.includes('?') ? '&' : '?';
            mergedUrl = `${current.url}${separator}t=${currentStart}/${nextEnd}&exact=1&ignore=x.mp4`;
          }
        }

        // Remaster title
        const remasteredTitle = remasterHeadline(current.title);

        const updated = { ...current };
        updated.title = remasteredTitle;
        updated.url = mergedUrl;
        if ('duration' in current || !('durationMs' in current)) {
          (updated as any).duration = totalDur;
        }
        if ('durationMs' in current) {
          (updated as any).durationMs = totalDur * 1000;
        }
        current = updated;
      } else {
        // Remaster title of individual segment if we are not merging further
        current.title = remasterHeadline(current.title);
        merged.push(current);
        current = next;
      }
    }
    current.title = remasterHeadline(current.title);
    merged.push(current);
    reconstructed.push(...merged);
  }

  return reconstructed;
}

export class M3UParser {
  static parse(text: string): any[] {
    const channels = parseM3U(text);
    const episodes: any[] = [];
    channels.forEach(ch => {
      ch.shows?.forEach(sh => {
        sh.episodes?.forEach(ep => {
          episodes.push({
            ...ep,
            groupTitle: ch.category,
            tvgName: ch.name,
            tvgLogo: ch.logoUrl
          });
        });
      });
    });
    return episodes;
  }
  static reconstructSegments = reconstructSegments;
  static classifyContentType = classifyContentType;
  static remasterHeadline = remasterHeadline;
  static enrichMissingDurations = enrichMissingDurations;
}

export async function parseM3UInWorker(text: string, filename: string = 'imported.m3u'): Promise<Channel[]> {
  if (typeof Worker !== 'undefined') {
    return new Promise((resolve) => {
      try {
        const worker = new Worker(new URL('../workers/m3uParser.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event) => {
          worker.terminate();
          if (event.data && event.data.success) {
            resolve(parseM3U(text, filename));
          } else {
            resolve(parseM3U(text, filename));
          }
        };
        worker.onerror = () => {
          worker.terminate();
          resolve(parseM3U(text, filename));
        };
        worker.postMessage({ rawM3uText: text, filename });
      } catch (e) {
        resolve(parseM3U(text, filename));
      }
    });
  }
  return parseM3U(text, filename);
}

/**
 * Parses an M3U/M3U8 playlist string into structured Channel objects.
 */
export function parseM3U(text: string, filename: string = 'imported.m3u'): Channel[] {
  const lines = text.split(/\r?\n/);
  
  // First, check if this is a master playlist.
  // We can scan the first 500 lines. If we find at least one EXTINF with duration > 10,
  // we can classify it as a master playlist!
  let isMasterPlaylist = false;
  let extinfCount = 0;
  for (let i = 0; i < Math.min(lines.length, 500); i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      extinfCount++;
      const durationPart = (line.substring(8) || '').split(',')[0].trim();
      const dur = parseInt(durationPart, 10);
      if (dur > 10) {
        isMasterPlaylist = true;
        break;
      }
    }
  }

  if (isMasterPlaylist) {
    return [parseMasterPlaylistM3U(text, filename)];
  }

  const channels: Channel[] = [];
  
  let currentExtinf: {
    duration: string;
    properties: Record<string, string>;
    name: string;
    customTags: Record<string, string>;
  } | null = null;
  
  let channelCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTM3U')) {
      // Header line, can contain global attributes
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      // Parse EXTINF line
      // Format: #EXTINF:<duration> <attributes>,<channel name>
      const extinfContent = line.substring(8);
      const commaIndex = extinfContent.lastIndexOf(',');
      
      let attributesPart = '';
      let channelName = 'Unnamed Channel';

      if (commaIndex !== -1) {
        attributesPart = extinfContent.substring(0, commaIndex);
        channelName = extinfContent.substring(commaIndex + 1).trim();
      } else {
        attributesPart = extinfContent;
      }

      // Extract duration (the first token before space)
      const durationMatch = attributesPart.match(/^([-\d]+)/);
      const duration = durationMatch ? durationMatch[1] : '-1';
      
      // Parse key="value" attributes
      const properties: Record<string, string> = {};
      const attributeRegex = /(\w+[-_]?\w*)="([^"]*)"/g;
      let match;
      while ((match = attributeRegex.exec(attributesPart)) !== null) {
        properties[match[1]] = match[2];
      }

      currentExtinf = {
        duration,
        properties,
        name: channelName,
        customTags: {}
      };
      continue;
    }

    if (line.startsWith('#EXTGRP:')) {
      // Category group tag
      if (currentExtinf) {
        currentExtinf.properties['group-title'] = line.substring(8).trim();
      }
      continue;
    }

    if (line.startsWith('#')) {
      // Custom / non-standard M3U tags
      if (currentExtinf) {
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1) {
          const key = line.substring(1, colonIndex).trim();
          const val = line.substring(colonIndex + 1).trim();
          currentExtinf.customTags[key] = val;
        } else {
          currentExtinf.customTags[line.substring(1)] = 'true';
        }
      }
      continue;
    }

    // It is a stream URL
    if (line.startsWith('http://') || line.startsWith('https://') || line.startsWith('rtmp://') || line.startsWith('rtsp://')) {
      const name = currentExtinf ? currentExtinf.name : `Channel ${channelCounter}`;
      const group = currentExtinf?.properties['group-title'] || currentExtinf?.properties['tvg-group'] || 'Uncategorized';
      const logoText = name.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const logoUrl = currentExtinf?.properties['tvg-logo'] || '';

      // Generate a mock show and episodes list for EPG support
      const mockEpisodes: Episode[] = [
        {
          id: `ep-${Math.random().toString(36).substr(2, 9)}`,
          title: `Stream Broadcast Loop`,
          season: '1',
          episodeNumber: '1',
          url: line
        }
      ];

      const mockShows: Show[] = [
        {
          id: `show-${Math.random().toString(36).substr(2, 9)}`,
          title: `${name} Live Feed`,
          description: `Direct interactive IPTV stream from ${filename}.`,
          year: new Date().getFullYear().toString(),
          genre: group || 'General',
          episodes: mockEpisodes
        }
      ];

      const colorPalette = ['#d97706', '#9333ea', '#16a34a', '#2563eb', '#db2777', '#06b6d4', '#f43f5e'];
      const accentColor = colorPalette[Math.floor(Math.random() * colorPalette.length)];

      channels.push({
        id: `ch-import-${Math.random().toString(36).substr(2, 9)}`,
        number: String(100 + channelCounter),
        name,
        tagline: currentExtinf?.properties['tvg-id'] 
          ? `EPG ID: ${currentExtinf.properties['tvg-id']}` 
          : `High quality stream looping from ${filename}`,
        category: group,
        logoText: logoText || 'IPTV',
        accentColor,
        shows: mockShows,
        url: line,
        backupUrls: [],
        customTags: currentExtinf?.customTags || {},
        status: 'unchecked',
        logoUrl
      });

      channelCounter++;
      currentExtinf = null;
    }
  }

  return channels;
}

/**
 * Generates an M3U file string from a list of Channel objects.
 */
export function exportM3U(channels: Channel[]): string {
  let m3u = '#EXTM3U\n';
  
  channels.forEach((ch) => {
    const tvgLogo = ch.logoUrl ? ` tvg-logo="${ch.logoUrl}"` : '';
    const groupTitle = ch.category ? ` group-title="${ch.category}"` : '';
    const tvgName = ` tvg-name="${ch.name}"`;
    const tvgId = ch.tagline.startsWith('EPG ID: ') ? ` tvg-id="${ch.tagline.replace('EPG ID: ', '')}"` : ` tvg-id="${ch.id}"`;

    m3u += `#EXTINF:-1${tvgId}${tvgName}${tvgLogo}${groupTitle},${ch.name}\n`;
    
    // Add custom tags if any
    if (ch.customTags) {
      Object.entries(ch.customTags).forEach(([key, val]) => {
        m3u += `#${key}:${val}\n`;
      });
    }

    // Prefer stream-level url or fall back to first episode url
    const streamUrl = ch.url || ch.shows?.[0]?.episodes?.[0]?.url || '';
    m3u += `${streamUrl}\n`;
  });

  return m3u;
}

/**
 * Generates a CSV string from a list of Channel objects.
 */
export function exportCSV(channels: Channel[]): string {
  let csv = 'Number,Name,Group,Stream URL,Backup URLs Count,Custom Tags Count,Status\n';
  
  channels.forEach((ch) => {
    const streamUrl = ch.url || ch.shows?.[0]?.episodes?.[0]?.url || '';
    const backsCount = ch.backupUrls?.length || 0;
    const tagsCount = ch.customTags ? Object.keys(ch.customTags).length : 0;
    const status = ch.status || 'unchecked';

    // Escape commas and quotes for CSV compatibility
    const cleanName = ch.name.replace(/"/g, '""');
    const cleanGroup = ch.category.replace(/"/g, '""');

    csv += `"${ch.number}","${cleanName}","${cleanGroup}","${streamUrl}",${backsCount},${tagsCount},"${status}"\n`;
  });

  return csv;
}

function extractShowName(title: string): string {
  const sanitized = title.replace(/\./g, ' ');
  const seasonMatch = sanitized.match(/^(.*?)\s*S\d+\s*[Ee]\d+/i);
  if (seasonMatch && seasonMatch[1]) {
    return seasonMatch[1].trim();
  }
  const parts = sanitized.split(/[:\-–]/);
  if (parts.length > 1) {
    return parts[0].trim();
  }
  return sanitized.trim();
}

function parseSeasonAndEpisode(title: string): { season?: string; episodeNumber?: string; cleanTitle: string } {
  const sanitized = title.replace(/\./g, ' ');
  const match = sanitized.match(/S(\d+)\s*[Ee](\d+)/i);
  if (match) {
    const season = String(parseInt(match[1], 10));
    const episodeNumber = String(parseInt(match[2], 10));
    let clean = sanitized;
    const cleanMatch = sanitized.split(/S\d+\s*[Ee]\d+[-\s]*|-/i);
    if (cleanMatch.length > 1) {
      clean = cleanMatch[cleanMatch.length - 1].trim();
    }
    return { season, episodeNumber, cleanTitle: clean };
  }
  return { cleanTitle: title };
}

export function parseMasterPlaylistM3U(text: string, filename: string = 'master_playlist.m3u'): Channel {
  const lines = text.split(/\r?\n/);
  const showsMap: Record<string, Episode[]> = {};
  
  let currentMeta: { title: string; durationMs: number } | null = null;
  let totalSegments = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      const infoPart = line.substring(8);
      const commaIndex = infoPart.lastIndexOf(',');
      const fullTitle = commaIndex !== -1 ? infoPart.substring(commaIndex + 1).trim() : "Unknown Broadcast";
      
      let durationSec = parseInt((infoPart || '').split(',')[0], 10);
      if (isNaN(durationSec) || durationSec <= 0) {
        durationSec = fullTitle.toLowerCase().includes("columbo") ? 5400 : 1800;
      }

      currentMeta = { title: fullTitle, durationMs: durationSec * 1000 };
    } else if (!line.startsWith('#') && currentMeta) {
      const showKey = extractShowName(currentMeta.title);
      const { season, episodeNumber, cleanTitle } = parseSeasonAndEpisode(currentMeta.title);
      
      const episodeEntry: Episode = {
        id: `ep-m3u-${Math.random().toString(36).substr(2, 9)}`,
        title: cleanTitle,
        url: line,
        season,
        episodeNumber,
        runtimeMins: currentMeta.durationMs / 1000 / 60,
        durationMs: currentMeta.durationMs,
        funFact: `Synchronized master segment. Precision Epoch Loop Duration: ${currentMeta.durationMs / 1000}s.`
      };

      if (!showsMap[showKey]) {
        showsMap[showKey] = [];
      }
      showsMap[showKey].push(episodeEntry);
      totalSegments++;
      currentMeta = null;
    }
  }

  const groupedShows: Show[] = Object.entries(showsMap).map(([title, episodes]) => {
    return {
      id: `show-m3u-${Math.random().toString(36).substr(2, 9)}`,
      title,
      description: `Continuous programmed broadcast of ${title}`,
      year: new Date().getFullYear().toString(),
      genre: 'Classic TV',
      episodes
    };
  });

  const name = filename.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
  const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);

  const colorPalette = ['#d97706', '#9333ea', '#16a34a', '#2563eb', '#db2777', '#06b6d4', '#f43f5e'];
  const accentColor = colorPalette[Math.floor(Math.random() * colorPalette.length)];

  return {
    id: `ch-master-m3u-${Math.random().toString(36).substr(2, 9)}`,
    number: '300',
    name: capitalizedName || 'Master Playlist Network',
    tagline: `Epoch Synchronized Loop Network • ${totalSegments} programmed programs`,
    category: 'Master Playlists',
    logoText: capitalizedName.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'MPN',
    accentColor,
    shows: groupedShows,
    status: 'unchecked'
  };
}

export function parseJsonPlaylistData(jsonData: any, channelName: string = 'Custom Station'): { shows: Show[]; firstVideoUrl: string; extractedName?: string } {
  if (!jsonData) {
    throw new Error('Empty JSON data provided.');
  }

  let itemsList: any[] = [];
  let nameFromHeader: string | undefined = undefined;

  if (Array.isArray(jsonData)) {
    itemsList = jsonData;
  } else if (typeof jsonData === 'object') {
    if (jsonData.name || jsonData.title) {
      nameFromHeader = jsonData.name || jsonData.title;
    }
    if (Array.isArray(jsonData.items)) {
      itemsList = jsonData.items;
    } else if (Array.isArray(jsonData.playlist)) {
      itemsList = jsonData.playlist;
    } else if (Array.isArray(jsonData.episodes)) {
      itemsList = jsonData.episodes;
    } else if (Array.isArray(jsonData.shows)) {
      itemsList = jsonData.shows;
    } else if (Array.isArray(jsonData.files)) {
      // Archive.org metadata files
      itemsList = jsonData.files.filter((f: any) => {
        const fmt = (f.format || '').toLowerCase();
        const name = (f.name || '').toLowerCase();
        return fmt.includes('mp4') || fmt.includes('mpeg') || fmt.includes('h.264') || name.endsWith('.mp4') || name.endsWith('.m4v') || name.endsWith('.m3u8');
      });
    } else if (jsonData.channels) {
      // Master playlist format
      itemsList = [];
      Object.entries(jsonData.channels).forEach(([k, chData]: [string, any]) => {
        if (chData.playlist) {
          itemsList.push(...chData.playlist.map((p: any) => ({ ...p, series: chData.name || k })));
        }
      });
    }
  }

  if (itemsList.length === 0) {
    throw new Error('No valid video playlist items found in JSON structure.');
  }

  const showsMap: Record<string, Episode[]> = {};

  itemsList.forEach((item, idx) => {
    const rawUrl = item.url || item.m4vUrl || item.fallbackUrl || item.src || item.link || item.file || item.streamUrl || item.stream;
    if (!rawUrl) return;

    let videoUrl = rawUrl;
    if (!videoUrl.startsWith('http://') && !videoUrl.startsWith('https://')) {
      if (jsonData.server && jsonData.dir) {
        videoUrl = `https://${jsonData.server}${jsonData.dir}/${videoUrl}`;
      }
    }

    const title = item.title || item.name || item.cleanTitle || item.filename || `Segment #${idx + 1}`;
    const seriesName = item.series || item.show || item.showTitle || item.group || nameFromHeader || channelName || 'Custom Broadcast';
    const durationSec = item.durationSec || item.duration || (item.durationMs ? item.durationMs / 1000 : 1800);
    const durationMs = durationSec * 1000;

    const episode: Episode = {
      id: `ep-json-${Math.random().toString(36).substring(2, 9)}`,
      title,
      url: videoUrl,
      season: String(item.season || '1'),
      episodeNumber: String(item.episodeNumber || idx + 1),
      runtimeMins: Math.ceil(durationSec / 60),
      durationMs,
      funFact: `JSON Playlist Stream • Duration: ${durationSec}s`
    };

    if (!showsMap[seriesName]) {
      showsMap[seriesName] = [];
    }
    showsMap[seriesName].push(episode);
  });

  const shows: Show[] = Object.entries(showsMap).map(([title, episodes]) => ({
    id: `show-json-${Math.random().toString(36).substring(2, 9)}`,
    title,
    description: `Custom JSON playlist show containing ${episodes.length} programmed segments.`,
    year: new Date().getFullYear().toString(),
    genre: 'Custom Feed',
    episodes
  }));

  const firstVideoUrl = shows[0]?.episodes[0]?.url || '';

  return {
    shows,
    firstVideoUrl,
    extractedName: nameFromHeader
  };
}

export async function fetchAndParseJsonPlaylist(url: string, channelName: string = 'Custom Station') {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch JSON playlist (${res.status} ${res.statusText})`);
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (err: any) {
    throw new Error(`Failed to parse JSON content from URL: ${err.message}`);
  }
  return parseJsonPlaylistData(json, channelName);
}

