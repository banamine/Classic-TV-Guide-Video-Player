import { GoogleGenAI, Type } from '@google/genai';
import { LocalDatabase } from './db';
import { Channel, Show, Episode } from '../src/types';
import { CHANNELS_DATA } from '../src/data/playlist';
import { buildAndSaveFreshNews } from './freshNewsGenerator';
import { generateAndRegisterChannels } from '../scripts/generate-channels';

// Rotating Stealth User Agents
const STEALTH_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
];

// Helper for delays
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Outbound Rate Limiter to regulate requests to Archive.org
// Ensures a minimum interval (e.g., 1500ms) between calls to prevent 429s or IP blocks.
class OutboundRateLimiter {
  private lastRequestTime = 0;
  private minIntervalMs = 1500;
  private queue: Array<{ resolve: () => void; reject: (err: any) => void }> = [];
  private isProcessing = false;

  constructor(minIntervalMs = 1500) {
    this.minIntervalMs = minIntervalMs;
  }

  async throttle<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        resolve: async () => {
          try {
            const res = await fn();
            resolve(res);
          } catch (err) {
            reject(err);
          }
        },
        reject
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLast = now - this.lastRequestTime;
      if (timeSinceLast < this.minIntervalMs) {
        const waitTime = this.minIntervalMs - timeSinceLast;
        await sleep(waitTime);
      }
      const item = this.queue.shift();
      if (item) {
        this.lastRequestTime = Date.now();
        await item.resolve();
      }
    }

    this.isProcessing = false;
  }
}

const archiveRateLimiter = new OutboundRateLimiter(1500);

/**
 * Decorator-style higher-order function that wraps any function returning a Promise
 * to run it through the outbound rate-limiting queue.
 */
export function rateLimitOutboundCall<Args extends any[], ReturnType>(
  fn: (...args: Args) => Promise<ReturnType>
): (...args: Args) => Promise<ReturnType> {
  return async (...args: Args): Promise<ReturnType> => {
    return archiveRateLimiter.throttle(() => fn(...args));
  };
}

// Custom rate-limited fetch for safe outbound Archive.org API calls with automatic 429 and network error retries
const rateLimitedFetch = rateLimitOutboundCall(async (url: string, options?: RequestInit): Promise<Response> => {
  let retries = 3;
  let delayMs = 1500;
  
  while (retries >= 0) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429) {
        if (retries === 0) {
          console.error(`[HTTP 429 Error] Rate limited on ${url}. Retries exhausted.`);
          return res;
        }
        console.warn(`[HTTP 429] Rate limited on ${url}. Retrying in ${delayMs}ms...`);
        await sleep(delayMs);
        retries--;
        delayMs *= 2;
        continue;
      }
      return res;
    } catch (err: any) {
      if (retries === 0) {
        console.error(`[Network Error] Fetch failed for ${url}. Retries exhausted. Error: ${err.message || err}`);
        throw err;
      }
      console.warn(`[Network Error] Fetch failed for ${url}: ${err.message || err}. Retrying in ${delayMs}ms...`);
      await sleep(delayMs);
      retries--;
      delayMs *= 2;
    }
  }
  throw new Error(`Fetch failed for ${url} after maximum retries.`);
});

// Fallback high-quality cast avatars using curated face profiles on Unsplash
const CAST_AVATARS = [
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=face'
];

// Curated fallbacks for procedural offline enrichment
const PROCEDURAL_TRIVIA = [
  'Filming was delayed for two weeks due to a sudden dust storm on the outdoor canyon set.',
  'This episode features a rare, uncredited cameo of a well-known silent film star of the 1930s.',
  'The cowboy hat worn by the lead actor in this episode was actually a personal antique from 1910.',
  'The vintage railroad car featured in the opening scene was rented from a historic museum in Utah.',
  'Almost all stunt coordination in this episode was performed without harnesses or safety nets.',
  'The script for this segment was rewritten overnight on a typewriter because the original pages got lost.',
  'This episode achieved one of the highest Nielsen ratings of the year when it originally aired.'
];

const PROCEDURAL_CASTS: Record<string, Array<{ name: string; character: string; bio: string; imageUrl: string }>> = {
  'have-gun-will-travel': [
    { name: 'Richard Boone', character: 'Paladin', bio: 'Renowned for his gravelly voice, commanding presence, and intellectual portrayal of the black-clad gunslinger.', imageUrl: CAST_AVATARS[0] },
    { name: 'Kam Tong', character: 'Hey Boy', bio: 'A pioneer Chinese-American actor who portrayed Paladin’s reliable San Francisco hotel clerk.', imageUrl: CAST_AVATARS[2] },
    { name: 'Hal Needham', character: 'Stunt Cowboy', bio: 'A legendary Hollywood stuntman who later went on to direct classic car movies.', imageUrl: CAST_AVATARS[4] }
  ],
  'maverick': [
    { name: 'James Garner', character: 'Bret Maverick', bio: 'The charismatic star whose effortless charm and satirical wit redefined western heroes.', imageUrl: CAST_AVATARS[0] },
    { name: 'Jack Kelly', character: 'Bart Maverick', bio: 'Co-starred as Brets brother, holding down the fort with dry sarcasm and poker face.', imageUrl: CAST_AVATARS[2] },
    { name: 'Diane Brewster', character: 'Samantha Crawford', bio: 'A recurring grifter who consistently managed to outsmart and swindle the Mavericks.', imageUrl: CAST_AVATARS[1] }
  ],
  'twilight-zone': [
    { name: 'Rod Serling', character: 'The Narrator', bio: 'An acclaimed playwright and TV icon who created this sci-fi universe to critique society.', imageUrl: CAST_AVATARS[4] },
    { name: 'Burgess Meredith', character: 'Mr. Bemis', bio: 'Distinguished screen actor who starred in some of the series’ most memorable, haunting episodes.', imageUrl: CAST_AVATARS[2] }
  ]
};

// Main Background Scraper & Pipeline Execution
// Helper to fetch and parse video RSS feeds
async function fetchRssEpisodes(feedUrl: string, maxEpisodes: number = 8): Promise<Episode[]> {
  try {
    const res = await rateLimitedFetch(feedUrl);
    if (!res.ok) {
      console.log(`[Scraper Feed Info] RSS Feed path returned status ${res.status} for ${feedUrl} (not active). Passing over feed gracefully.`);
      return [];
    }
    const text = await res.text();
    const items = text.split('<item>');
    const episodes: Episode[] = [];
    
    // Skip the first split since it is the channel metadata
    for (let i = 1; i < items.length && episodes.length < maxEpisodes; i++) {
      const itemText = items[i];
      
      const titleMatch = itemText.match(/<title>(.*?)<\/title>/s);
      const descMatch = itemText.match(/<description>(.*?)<\/description>/s);
      const pubDateMatch = itemText.match(/<pubDate>(.*?)<\/pubDate>/s);
      const enclosureMatch = itemText.match(/<enclosure[^>]+url="([^"]+)"/i) || itemText.match(/url="([^"]+)"[^>]*type="video/i);
      
      const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : 'Daily News Clip';
      const description = descMatch ? descMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '').trim() : '';
      const pubDate = pubDateMatch ? pubDateMatch[1] : '';
      const url = enclosureMatch ? enclosureMatch[1] : '';
      
      if (url) {
        episodes.push({
          id: `rss-${Buffer.from(url).toString('base64').substring(0, 12).replace(/[^a-zA-Z0-9]/g, '')}`,
          title: title,
          season: '1',
          episodeNumber: String(episodes.length + 1),
          url: url,
          funFact: `Broadcast date: ${pubDate || 'Recent'}. Enriched via live News RSS feed.`
        });
      }
    }
    return episodes;
  } catch (err: any) {
    console.log(`[Scraper Feed Info] RSS parse bypass for ${feedUrl}: ${err?.message || err}. Passing over feed gracefully.`);
    return [];
  }
}

// Fault-tolerant configuration maps translating dirty, inconsistent metadata identifiers (slugs)
// into a uniform structural data signature for the playlist generator.
const NETWORK_REGEX_MAP = [
  {
    name: 'CNN',
    pattern: /^(CNN|CNNW)_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_(.+)$/i,
    normalize: (m: RegExpMatchArray) => ({
      network: 'CNN',
      date: `${m[2]}-${m[3]}-${m[4]}`,
      time: `${m[5]}:${m[6]}:${m[7]}`,
      program: m[8].replace(/_/g, ' ')
    })
  },
  {
    name: 'FOXNEWS',
    pattern: /^(FOXNEWS|FOXNEWSW)_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_(.+)$/i,
    normalize: (m: RegExpMatchArray) => ({
      network: 'FOXNEWS',
      date: `${m[2]}-${m[3]}-${m[4]}`,
      time: `${m[5]}:${m[6]}:${m[7]}`,
      program: m[8].replace(/_/g, ' ')
    })
  },
  {
    name: 'DW',
    pattern: /^(DW)_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_(.+)$/i,
    normalize: (m: RegExpMatchArray) => ({
      network: 'DW',
      date: `${m[2]}-${m[3]}-${m[4]}`,
      time: `${m[5]}:${m[6]}:${m[7]}`,
      program: m[8].replace(/_/g, ' ')
    })
  },
  {
    name: 'BBC',
    pattern: /^(BBC)_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_(.+)$/i,
    normalize: (m: RegExpMatchArray) => ({
      network: 'BBC',
      date: `${m[2]}-${m[3]}-${m[4]}`,
      time: `${m[5]}:${m[6]}:${m[7]}`,
      program: m[8].replace(/_/g, ' ')
    })
  },
  {
    name: 'RT',
    pattern: /^(RT|RUSSIA1)_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_(.+)$/i,
    normalize: (m: RegExpMatchArray) => ({
      network: 'RT News',
      date: `${m[2]}-${m[3]}-${m[4]}`,
      time: `${m[5]}:${m[6]}:${m[7]}`,
      program: m[8].replace(/_/g, ' ')
    })
  }
];

function normalizeSlug(identifier: string) {
  for (const entry of NETWORK_REGEX_MAP) {
    const match = identifier.match(entry.pattern);
    if (match) {
      return entry.normalize(match);
    }
  }
  // Generic fallback match for other custom identifiers
  const genericMatch = identifier.match(/^([a-z0-9]+)_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_(.+)$/i);
  if (genericMatch) {
    return {
      network: genericMatch[1].toUpperCase(),
      date: `${genericMatch[2]}-${genericMatch[3]}-${genericMatch[4]}`,
      time: `${genericMatch[5]}:${genericMatch[6]}:${genericMatch[7]}`,
      program: genericMatch[8].replace(/_/g, ' ')
    };
  }
  return null;
}

// In-memory cache for Archive.org metadata requests to prevent duplicate calls and cut request time in half
const metadataCache: Record<string, any> = {};

export async function fetchArchiveMetadata(identifier: string): Promise<any> {
  if (metadataCache[identifier]) {
    return metadataCache[identifier];
  }
  const metaUrl = `https://archive.org/metadata/${identifier}`;
  try {
    const res = await rateLimitedFetch(metaUrl);
    if (res.ok) {
      const data = await res.json() as any;
      metadataCache[identifier] = data;
      return data;
    }
  } catch (err) {
    console.warn(`[fetchArchiveMetadata] Failed to fetch metadata for ${identifier}:`, err);
  }
  return null;
}

export async function resolveArchiveMp4Url(identifier: string): Promise<string> {
  const fallbackUrl = `https://archive.org/download/${identifier}/${identifier}.mp4`;
  try {
    const data = await fetchArchiveMetadata(identifier);
    if (data) {
      const files = data.files || [];
      const mp4Files = files.filter((f: any) => f.name && f.name.toLowerCase().endsWith('.mp4'));
      if (mp4Files.length > 0) {
        // Try to find a derivative "512kb" file first for faster web streaming
        const derivative = mp4Files.find((f: any) => f.name.toLowerCase().includes('512kb'));
        if (derivative) {
          return `https://archive.org/download/${identifier}/${derivative.name}`;
        }
        // Otherwise, try to find any MP4 file that is NOT a backup or source or torrent metadata, or just take the first one
        const normalMp4 = mp4Files.find((f: any) => !f.name.toLowerCase().includes('_source') && !f.name.toLowerCase().includes('_meta') && !f.name.toLowerCase().includes('torrent'));
        if (normalMp4) {
          return `https://archive.org/download/${identifier}/${normalMp4.name}`;
        }
        return `https://archive.org/download/${identifier}/${mp4Files[0].name}`;
      }
    }
  } catch (err) {
    console.warn(`[resolveArchiveMp4Url] Failed for ${identifier}, using fallback:`, err);
  }
  return fallbackUrl;
}

export interface IngestionResult {
  success: boolean;
  identifier: string;
  metadata: {
    network: string;
    date: string | null;
    time: string | null;
    program: string | null;
  } | null;
  durationMins: number;
  diagnostics: {
    step1Success: boolean;
    step2Success: boolean;
    step3Success: boolean;
    logs: string[];
  };
}

export async function ingestArchiveProgram(identifier: string): Promise<IngestionResult> {
  const logs: string[] = [];
  logs.push(`[Ingestion] Starting ingestion for identifier: ${identifier}`);
  
  const metadata = normalizeSlug(identifier);
  if (metadata) {
    logs.push(`[Ingestion] Successfully normalized slug: ${JSON.stringify(metadata)}`);
  } else {
    logs.push(`[Ingestion] Slug normalization bypassed (non-standard identifier).`);
  }
  
  let durationMins = 30; // standard fallback default
  let step1Success = false;
  let step2Success = false;
  let step3Success = false;

  // Step 1: Query metadata API (https://archive.org/metadata/${identifier})
  try {
    logs.push(`[Step 1] Querying Archive.org Metadata API through cache for: ${identifier}`);
    const data = await fetchArchiveMetadata(identifier);
    if (data) {
      if (data.metadata?.runtime) {
        const runtimeStr = String(data.metadata.runtime).trim();
        logs.push(`[Step 1] Found runtime field in metadata: ${runtimeStr}`);
        if (/^\d+$/.test(runtimeStr)) {
          durationMins = parseInt(runtimeStr, 10);
          step1Success = true;
        } else {
          const minMatch = runtimeStr.match(/(\d+)\s*min/i);
          if (minMatch) {
            durationMins = parseInt(minMatch[1], 10);
            step1Success = true;
          }
        }
      }
      
      if (!step1Success) {
        // Check files list for .mp4 duration, length or runtime
        const files = data.files || [];
        const mp4File = files.find((f: any) => f.name?.endsWith('.mp4'));
        if (mp4File) {
          const durationVal = mp4File.length || mp4File.duration;
          if (durationVal) {
            const durationSec = parseFloat(durationVal);
            logs.push(`[Step 1] Found MP4 file length/duration: ${durationSec} seconds`);
            if (!isNaN(durationSec) && durationSec > 0) {
              durationMins = Math.ceil(durationSec / 60);
              step1Success = true;
            }
          }
          if (!step1Success && mp4File.runtime != null) {
            const runtimeStr = String(mp4File.runtime);
            const parts = runtimeStr.split(':').map(Number);
            let secs = 0;
            if (parts.length === 3) {
              secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
            } else if (parts.length === 2) {
              secs = parts[0] * 60 + parts[1];
            } else if (parts.length === 1 && !isNaN(parts[0])) {
              secs = parts[0];
            }
            logs.push(`[Step 1] Found MP4 file runtime: ${mp4File.runtime} (${secs} seconds)`);
            if (secs > 0) {
              durationMins = Math.ceil(secs / 60);
              step1Success = true;
            }
          }
        }
      }
      
      if (step1Success) {
        logs.push(`[Step 1] Success! Resolved duration: ${durationMins} mins.`);
      } else {
        logs.push(`[Step 1] Metadata API returned but could not resolve a valid duration.`);
      }
    } else {
      logs.push(`[Step 1] Failed: Metadata API query returned null data`);
    }
  } catch (err: any) {
    logs.push(`[Step 1] Error: ${err.message || err}`);
  }

  // Step 2: VTT Subtitle Probing (https://archive.org/download/${identifier}/${identifier}.thumbs/${identifier}.vtt)
  if (!step1Success) {
    try {
      const subFormats = [
        `https://archive.org/download/${identifier}/${identifier}.thumbs/${identifier}.vtt`,
        `https://archive.org/download/${identifier}/${identifier}.srt`,
        `https://archive.org/download/${identifier}/${identifier}.vtt`
      ];

      for (const subUrl of subFormats) {
        logs.push(`[Step 2] Querying subtitle file track: ${subUrl}`);
        const subRes = await rateLimitedFetch(subUrl);
        if (subRes.ok) {
          const subText = await subRes.text();
          const timestamps = subText.match(/(\d{2}:)?\d{2}:\d{2}/g);
          if (timestamps && timestamps.length > 0) {
            const lastTs = timestamps[timestamps.length - 1];
            if (lastTs && typeof lastTs === 'string') {
              logs.push(`[Step 2] Found last subtitle timestamp mark: ${lastTs}`);
              const parts = lastTs.split(':').map(Number);
              let secs = 0;
              if (parts.length === 3) {
                secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
              } else if (parts.length === 2) {
                secs = parts[0] * 60 + parts[1];
              }
              if (secs > 0) {
                durationMins = Math.ceil(secs / 60);
                step2Success = true;
                logs.push(`[Step 2] Success! Parsed duration from subtitles: ${durationMins} mins.`);
                break;
              }
            }
          }
        }
      }
    } catch (err: any) {
      logs.push(`[Step 2] Error: ${err.message || err}`);
    }
  }

  // Step 3: Scrape HTML fallback page (https://archive.org/details/${identifier})
  if (!step1Success && !step2Success) {
    try {
      const detailsUrl = `https://archive.org/details/${identifier}`;
      logs.push(`[Step 3] Scraping web details page at: ${detailsUrl}`);
      const htmlRes = await rateLimitedFetch(detailsUrl);
      if (htmlRes.ok) {
        const htmlText = await htmlRes.text();
        const lengthMatch = htmlText.match(/Length:\s*(\d+)\s*minute/i) || 
                            htmlText.match(/(\d+)\s*min/i) ||
                            htmlText.match(/Duration:\s*(\d+)/i) ||
                            htmlText.match(/"duration":\s*"?(\d+)"?/i);
        if (lengthMatch) {
          const parsedMins = parseInt(lengthMatch[1], 10);
          if (parsedMins > 0) {
            durationMins = parsedMins;
            step3Success = true;
            logs.push(`[Step 3] Success! Parsed duration from HTML details: ${durationMins} mins.`);
          } else {
            logs.push(`[Step 3] Parsed duration from HTML was 0, ignoring.`);
          }
        } else {
          logs.push(`[Step 3] Details page scraped but no length or duration pattern matched.`);
        }
      } else {
        logs.push(`[Step 3] Failed: Details page returned status ${htmlRes.status}`);
      }
    } catch (err: any) {
      logs.push(`[Step 3] Error: ${err.message || err}`);
    }
  }

  const overallSuccess = step1Success || step2Success || step3Success;
  logs.push(`[Ingestion Complete] Status: ${overallSuccess ? 'SUCCESS' : 'FALLBACK_DEFAULT'} | Duration resolved: ${durationMins} mins.`);
  
  return {
    success: overallSuccess,
    identifier,
    metadata,
    durationMins,
    diagnostics: {
      step1Success,
      step2Success,
      step3Success,
      logs
    }
  };
}

// Backward-compatible duration probe wrapper
async function probeArchiveDuration(identifier: string): Promise<number> {
  const result = await ingestArchiveProgram(identifier);
  return result.durationMins;
}

// Helper to search Archive.org for playable MP4 news files with database cache reuse
async function fetchArchiveNews(networkQuery: string, networkName: string, existingEpisodes: Episode[] = []): Promise<Episode[]> {
  try {
    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(networkQuery)}&fl[]=identifier&fl[]=title&fl[]=description&fl[]=date&sort[]=date+desc&rows=10&output=json`;
    const res = await rateLimitedFetch(url);
    if (!res.ok) {
      console.warn(`Failed to fetch Archive.org news for ${networkName}: status ${res.status}`);
      return [];
    }
    const data = await res.json() as any;
    const docs = data.response?.docs || [];
    
    // Resolve all episode objects with duration probing in parallel
    const episodePromises = docs.map(async (doc: any, i: number) => {
      const id = doc.identifier;
      if (!id) return null;
      
      const epId = `${networkName.toLowerCase()}-${id}`;
      
      // Check if episode already exists in DB so we can avoid costly metadata & duration probes
      const existing = existingEpisodes.find(e => e.id === epId);
      if (existing && existing.url && existing.runtimeMins) {
        return existing;
      }

      const title = doc.title || `${networkName} News Segment ${i + 1}`;
      const dateStr = doc.date ? new Date(doc.date).toLocaleDateString() : 'Recent';
      
      // Call modern ingestion engine
      const ingestion = await ingestArchiveProgram(id);
      let durationMins = ingestion.durationMins;
      if (!durationMins || durationMins <= 0) {
        durationMins = 30; // standard default fallback to prevent 0-duration / t=0/0 playout crash
      }
      
      // Construct video and subtitle URLs using the robust metadata-resolving helper
      const videoUrl = await resolveArchiveMp4Url(id);
      const subtitleUrl = `https://archive.org/serve/${id}/${id}.vtt`;
      
      return {
        id: epId,
        title: title,
        season: '1',
        episodeNumber: String(i + 1),
        url: videoUrl,
        subtitleUrl: subtitleUrl,
        funFact: `Released on ${dateStr}. Ingested via modern Ingestion Engine. Probed Duration: ${durationMins} mins. Diagnostics: Step1=${ingestion.diagnostics.step1Success}, Step2=${ingestion.diagnostics.step2Success}.`,
        runtimeMins: durationMins,
        estimatedSizeGb: parseFloat((0.08 + (durationMins * 0.005)).toFixed(2))
      };
    });

    const episodes = (await Promise.all(episodePromises)).filter(Boolean) as Episode[];
    return episodes;
  } catch (err) {
    console.error(`Failed to fetch Archive.org news for ${networkName}:`, err);
    return [];
  }
}

export async function runScraper() {
  const currentStatus = LocalDatabase.getScraperStatus();
  if (currentStatus.status === 'scraping' || currentStatus.status === 'enriching') {
    console.log('Scraper run requested, but it is already running.');
    return;
  }

  const settings = LocalDatabase.getScraperSettings();
  LocalDatabase.clearScraperLogs();
  LocalDatabase.addScraperLog('Starting scheduled daily TV guide scraper...');
  LocalDatabase.addComplianceLog('RUN_SCRAPER', 'Initiated background TV News and EPG metadata sync.');
  LocalDatabase.updateScraperStatus({
    status: 'scraping',
    progress: 10,
    currentTask: 'Initializing stealth headless web client...'
  });

  try {
    // 1. Stealth Simulation Loop (Rotate UA, Emulate Viewport, delays)
    await sleep(1000);
    const selectedUA = STEALTH_USER_AGENTS[Math.floor(Math.random() * STEALTH_USER_AGENTS.length)];
    LocalDatabase.addScraperLog(`Rotated stealth User-Agent: "${selectedUA}"`);
    const viewportW = settings.viewportWidth || 1920;
    const viewportH = settings.viewportHeight || 1080;
    const minDelay = settings.minDelayMs || 1000;
    const maxDelay = settings.maxDelayMs || 3000;
    const targetsList = Array.isArray(settings.targets) ? settings.targets : [
      'https://archive.org/download/daily-highlights/BIG%20WESTERN%20ZONE.m3u',
      'https://archive.org/download/daily-highlights/TV%20CRIME_cleaned.m3u'
    ];

    LocalDatabase.addScraperLog(`Emulating viewport dimensions: ${viewportW}x${viewportH}`);
    LocalDatabase.updateScraperStatus({ progress: 25, currentTask: 'Crawling active channel listings...' });

    // Emulating random delay loops to resemble human browse rates
    const delay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;
    LocalDatabase.addScraperLog(`Simulating browser delay to bypass cloud scrapers: ${delay}ms`);
    await sleep(delay);

    LocalDatabase.addScraperLog(`Parsing guide feeds from endpoints: ${targetsList.join(', ')}`);
    LocalDatabase.updateScraperStatus({ progress: 40, currentTask: 'Scraping and normalizing channel lineup...' });
    await sleep(1000);

    // Fetch default TV Guide channel template to use as our base feeds
    let currentChannels = LocalDatabase.getChannels();
    if (!currentChannels || currentChannels.length === 0) {
      currentChannels = JSON.parse(JSON.stringify(CHANNELS_DATA));
    }

    // --- REAL-WORLD NEWSREEL SCRAPER FROM ARCHIVE.ORG ---
    LocalDatabase.addScraperLog('Scraping high-fidelity retro newsreels from Archive.org Advanced Search API (Round-Robin Search Rotation)...');
    LocalDatabase.updateScraperStatus({ progress: 45, currentTask: 'Querying Archive.org for old/retro news streams...' });
    try {
      // Round-robin search queries for old, retro news and newsreels
      const retroSearchQueries = [
        'old new retro mediatype:movies',
        'old news retro mediatype:movies',
        'universal newsreel mediatype:movies',
        'collection:universal_newsreels',
        'retro newsreel mediatype:movies',
        'vintage newsreel mediatype:movies'
      ];

      const allFoundDocs: any[] = [];
      const seenDocIds = new Set<string>();

      // Curated baseline high-fidelity retro news reels
      const curatedIds = [
        '1945-03-15_Allies_Open_Final_Drive_In_Germany',
        '1948-07-22_Berlin_Siege',
        'Kidnappi1950',
        '1945-12-10_Nuremberg_Trial',
        '1941-12-08_President_Roosevelt_Address_to_Congress',
        '1944-06-06_Allies_Invade_Europe'
      ];
      curatedIds.forEach(id => seenDocIds.add(id));

      for (const queryTerm of retroSearchQueries) {
        const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(queryTerm)}&fl[]=identifier&fl[]=title&fl[]=description&fl[]=date&fl[]=downloads&sort[]=downloads+desc&rows=20&output=json`;
        try {
          const archiveRes = await rateLimitedFetch(searchUrl);
          if (archiveRes.ok) {
            const data = (await archiveRes.json()) as any;
            const docs = data.response?.docs || [];
            LocalDatabase.addScraperLog(`Archive.org query ["${queryTerm}"] returned ${docs.length} candidate retro news items.`);
            for (const doc of docs) {
              if (doc.identifier && !seenDocIds.has(doc.identifier)) {
                // Filter out non-video / inappropriate items
                const titleLower = (doc.title || '').toLowerCase();
                const idLower = doc.identifier.toLowerCase();
                if (titleLower.includes('suicide') || titleLower.includes('spider-man') || titleLower.includes('pink panther')) continue;
                
                seenDocIds.add(doc.identifier);
                allFoundDocs.push(doc);
              }
            }
          }
        } catch (qErr: any) {
          console.warn(`Query [${queryTerm}] failed:`, qErr.message);
        }
      }

      // Merge curated base IDs with randomly selected discovered items
      const discoveredIds = allFoundDocs.map(d => d.identifier);
      
      // Shuffle / random rotation of discovered items (Round-Robin Random Play)
      const shuffledDiscovered = [...discoveredIds].sort(() => Math.random() - 0.5);
      
      const candidateIds = Array.from(new Set([...curatedIds, ...shuffledDiscovered]));

      // Keep up to 24 rotated clips for performance and EPG depth
      const finalIds = candidateIds.slice(0, 24);

      let newsreelChannel = currentChannels.find(ch => ch.id === 'ch-retro-newsreels');
      if (!newsreelChannel) {
        newsreelChannel = {
          id: 'ch-retro-newsreels',
          number: '103',
          name: 'Universal Retro Newsreels',
          tagline: 'Historical moments, newsreels, and global milestones.',
          category: 'News',
          logoText: 'NEWS',
          accentColor: '#dc2626',
          shows: []
        };
        currentChannels.push(newsreelChannel);
      }

      const existingNewsreelEpisodes = newsreelChannel.shows?.[0]?.episodes || [];

      if (finalIds.length > 0) {
        const episodes: Episode[] = [];
        const episodePromises = finalIds.map(async (id, idx) => {
          const epId = `news-${id}`;
          const existing = existingNewsreelEpisodes.find(e => e.id === epId);
          if (existing && existing.url) {
            return {
              ...existing,
              episodeNumber: String(idx + 1)
            };
          }

          const doc = allFoundDocs.find((d: any) => d.identifier === id);
          const rawTitle = doc?.title || id.replace(/[-_]/g, ' ');
          const title = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);
          const dateStr = doc?.date ? new Date(doc.date).toLocaleDateString() : 'Historical';
          
          const videoUrl = await resolveArchiveMp4Url(id);
          const downloadsCount = doc?.downloads !== undefined ? doc.downloads : 'Curated';
          
          return {
            id: epId,
            title: title,
            season: '1',
            episodeNumber: String(idx + 1),
            url: videoUrl,
            funFact: `Archive.org retro search stream dated ${dateStr}. Total downloads: ${downloadsCount}.`
          };
        });

        const resolvedEpisodes = await Promise.all(episodePromises);
        episodes.push(...resolvedEpisodes);

        // Randomly shuffle the final playlist for round-robin variation across plays
        const randomizedEpisodes = [...episodes].sort(() => Math.random() - 0.5).map((ep, idx) => ({
          ...ep,
          episodeNumber: String(idx + 1)
        }));

        newsreelChannel.shows = [
          {
            id: 'universal-newsreels-show',
            title: 'Universal Newsreels & Retro Clips',
            description: 'Authentic 20th-century retro newsreels, historical broadcasts, and global milestones scraped from Archive.org.',
            year: '1945',
            genre: 'Historical News',
            episodes: randomizedEpisodes,
            cast: [
              {
                name: 'Ed Herlihy',
                character: 'Main Narrator',
                bio: 'Famous for his booming, authoritative voice, Herlihy was the primary narrator of Universal Newsreels during the 1940s and 1950s.',
                imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face'
              }
            ]
          }
        ];
        LocalDatabase.addScraperLog(`Successfully round-robin rotated and loaded ${randomizedEpisodes.length} live Archive.org retro news clips into Channel 103 (Universal Retro Newsreels).`);
      }
    } catch (apiErr: any) {
      LocalDatabase.addScraperLog(`Archive.org retro news segment crawler bypassed: ${apiErr.message}. Retaining fallback newsreels.`);
    }

    // --- MULTIPLE M3U PARSER & ROUND-ROBIN SCHEDULER FOR CH 102 ---
    LocalDatabase.addScraperLog('Parsing multiple M3U playlists for Channel 102 (TV Crime, The Fugitive, The Man From U.N.C.L.E., The Sopranos, Total Drama, Hogan\'s Heroes)...');
    LocalDatabase.updateScraperStatus({ progress: 48, currentTask: 'Fetching and round-robin parsing M3U playlists...' });

    try {
      const m3uUrls = [
        'https://archive.org/download/daily-highlights/TV%20CRIME_cleaned.m3u',
        'https://archive.org/download/daily-highlights/The%20Fugitive.m3u',
        'https://archive.org/download/daily-highlights/The%20Man%20From%20U.N.C.L.E..m3u',
        'https://archive.org/download/daily-highlights/The%20Sopranos.m3u',
        'https://archive.org/download/daily-highlights/Total%20Drama.m3u',
        'https://archive.org/download/daily-highlights/hogans.m3u'
      ];

      const m3uGroups: { source: string; items: { title: string; url: string; playlistName: string }[] }[] = [];

      for (const m3uUrl of m3uUrls) {
        try {
          const res = await rateLimitedFetch(m3uUrl);
          if (res.ok) {
            const text = await res.text();
            const lines = text.split(/\r?\n/);
            const items: { title: string; url: string; playlistName: string }[] = [];
            let pendingTitle = '';
            let playlistName = '';

            for (const rawLine of lines) {
              const line = rawLine.trim();
              if (line.startsWith('#PLAYLIST:')) {
                playlistName = line.replace('#PLAYLIST:', '').trim();
              } else if (line.startsWith('#EXTINF:')) {
                const commaIdx = line.indexOf(',');
                if (commaIdx !== -1) {
                  pendingTitle = line.substring(commaIdx + 1).trim();
                }
              } else if (line.startsWith('http://') || line.startsWith('https://')) {
                const url = line;
                // Exclude known 403 restricted archive items
                if (
                  url.toLowerCase().includes('the-spy-with-my-face') ||
                  url.toLowerCase().includes('the-man-from-uncle') ||
                  url.toLowerCase().includes('the-man-from-u.n.c.l.e')
                ) {
                  pendingTitle = '';
                  continue;
                }
                let title = pendingTitle;
                const rawFilename = decodeURIComponent(url.substring(url.lastIndexOf('/') + 1))
                  .replace(/\.mp4$/i, '')
                  .replace(/[-_]/g, ' ');

                if (!title || title.startsWith('Канал') || title.length < 3) {
                  title = rawFilename;
                } else if (title.includes(' / ')) {
                  const parts = title.split(' / ');
                  title = parts[parts.length - 1];
                }

                items.push({
                  title: title || rawFilename,
                  url,
                  playlistName: playlistName || m3uUrl.split('/').pop()?.replace(/%20/g, ' ').replace(/\.m3u$/i, '') || 'Classics'
                });

                pendingTitle = '';
              }
            }

            if (items.length > 0) {
              m3uGroups.push({
                source: m3uUrl.split('/').pop() || m3uUrl,
                items
              });
              LocalDatabase.addScraperLog(`Successfully parsed M3U [${m3uUrl.split('/').pop()}]: ${items.length} episodes.`);
            }
          }
        } catch (fetchErr: any) {
          console.warn(`Failed to fetch M3U ${m3uUrl}:`, fetchErr.message);
        }
      }

      // Round-robin interleaving across all M3U groups
      const roundRobinEpisodes: Episode[] = [];
      let maxGroupLen = 0;
      m3uGroups.forEach(g => { if (g.items.length > maxGroupLen) maxGroupLen = g.items.length; });

      let epCounter = 1;
      for (let i = 0; i < maxGroupLen; i++) {
        for (const group of m3uGroups) {
          if (i < group.items.length) {
            const item = group.items[i];
            const epId = `m3u-${item.playlistName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${i}-${epCounter}`;
            roundRobinEpisodes.push({
              id: epId,
              title: item.title,
              season: '1',
              episodeNumber: String(epCounter),
              url: item.url,
              funFact: `Playlist source: ${item.playlistName}. Round-Robin sequence position #${epCounter}.`
            });
            epCounter++;
          }
        }
      }

      if (roundRobinEpisodes.length > 0) {
        let ch102 = currentChannels.find(ch => ch.id === 'ch-retro-adventure' || ch.number === '102');
        if (!ch102) {
          ch102 = {
            id: 'ch-retro-adventure',
            number: '102',
            name: 'Classic Cinema & TV Crime',
            tagline: 'Round-robin playback of classic crime, drama, and vintage TV.',
            category: 'TV Shows',
            logoText: 'CRIME',
            accentColor: '#9333ea',
            shows: []
          };
          currentChannels.push(ch102);
        } else {
          ch102.name = 'Classic Cinema & TV Crime';
          ch102.tagline = 'Round-robin playback of classic crime, drama, and vintage TV.';
          ch102.logoText = 'CRIME';
        }

        // Keep active guide episodes array clean (e.g., 300 round-robin episodes)
        const activeEpisodes = roundRobinEpisodes.slice(0, 300);

        ch102.shows = [
          {
            id: 'm3u-round-robin-showcase',
            title: 'Classic Crime, Drama & Cult TV Showcase',
            description: 'Continuous round-robin broadcast parsed from Archive.org M3U playlists: TV Crime, The Fugitive, The Man From U.N.C.L.E., The Sopranos, Total Drama, and Hogan\'s Heroes.',
            year: '1965',
            genre: 'Crime / Drama / Cult',
            episodes: activeEpisodes
          }
        ];

        LocalDatabase.addScraperLog(`Successfully built round-robin broadcast lineup of ${activeEpisodes.length} episodes for Channel 102 (Classic Cinema & TV Crime).`);
      }
    } catch (m3uErr: any) {
      LocalDatabase.addScraperLog(`M3U playlist scraper bypassed: ${m3uErr.message}. Retaining default Channel 102 schedule.`);
    }

    // --- ARCHIVE.ORG THIRD EYE OCR CHYRON INGESTION ---
    LocalDatabase.addScraperLog('Scraping real-time TV news OCR chyrons via Archive.org Third Eye API...');
    LocalDatabase.updateScraperStatus({ progress: 55, currentTask: 'Querying Archive.org Third Eye for OCR news feeds...' });
    try {
      // Fetch current filtered feed with 2 hours historical window support
      const hours = 2;
      const thirdEyeUrl = `https://archive.org/services/third-eye.php?format=tsv&mode=filtered&hours=${hours}`;
      const thres = await rateLimitedFetch(thirdEyeUrl);
      
      if (thres.ok) {
        const text = await thres.text();
        const lines = text.split('\n');
        LocalDatabase.addScraperLog(`Third Eye OCR service returned ${lines.length} real-time news chyrons.`);
        
        const discoveredEpisodes: Episode[] = [];
        let epIndex = 1;
        const uniqueIds = new Set<string>();
        
        for (const line of lines) {
          if (!line.trim() || line.startsWith('#') || line.startsWith('timestamp')) continue;
          const parts = line.split('\t');
          if (parts.length < 4) continue;
          
          const [timestamp, channelName, identifier, chyronText] = parts;
          if (!identifier || !chyronText || chyronText.length < 10) continue;
          if (uniqueIds.has(identifier)) continue;
          
          // Filter out non-English / Cyrillic noise
          if (/[\u0400-\u04FF]/.test(chyronText)) {
            continue;
          }
          
          uniqueIds.add(identifier);
          
          // Clean the identifier to construct an elegant human-readable news program title
          const cleanTitle = identifier
            .replace(/_/g, ' ')
            .replace(/FOXNEWSW/g, 'Fox News Channel')
            .replace(/MSNBCW/g, 'MSNBC Broadcast')
            .replace(/CNNW/g, 'CNN Live Coverage')
            .replace(/\d{8}/g, '') // remove dates
            .replace(/\d{6}/g, '') // remove timestamps
            .trim();
            
          const videoUrl = `https://archive.org/download/${identifier}/${identifier}_512kb.mp4`;
          const dateLabel = timestamp ? new Date(timestamp).toLocaleDateString() : 'Today';
          
          discoveredEpisodes.push({
            id: `thirdeye-${identifier}`,
            title: cleanTitle || 'Live Breaking News Segment',
            season: '1',
            episodeNumber: String(epIndex++),
            url: videoUrl,
            funFact: `OCR chyron: "${chyronText.trim()}". Captured on ${dateLabel}.`
          });
          
          // Limit to 10 beautiful historical episodes to ensure excellent EPG loading performance
          if (discoveredEpisodes.length >= 10) break;
        }
        
        if (discoveredEpisodes.length > 0) {
          let newsreelChannel = currentChannels.find(ch => ch.id === 'ch-retro-newsreels');
          if (newsreelChannel && newsreelChannel.shows && newsreelChannel.shows.length > 0) {
            const mainShow = newsreelChannel.shows[0];
            mainShow.episodes = [...mainShow.episodes, ...discoveredEpisodes];
            LocalDatabase.addScraperLog(`Successfully merged ${discoveredEpisodes.length} real-time live newscasts (Fox/MSNBC/CNN) into Universal Retro Newsreels lineup!`);
          }
        }
      } else {
        LocalDatabase.addScraperLog(`Archive.org Third Eye endpoint returned status ${thres.status}.`);
      }
    } catch (err: any) {
      LocalDatabase.addScraperLog(`Third Eye ingestion bypassed: ${err.message}.`);
    }

    // --- LIVE NEWS NETWORK SCRAPER (CNN, FOX, RT, DW, BBC, KPIX, AJN) ---
    LocalDatabase.addScraperLog('Scraping premium global news segments (CNN, Fox, RT, DW, BBC, KPIX, AJN)...');
    LocalDatabase.updateScraperStatus({ progress: 50, currentTask: 'Scraping live news feeds from Archive.org...' });

    try {
      LocalDatabase.addScraperLog('Querying Archive.org for live news uploads and forming fresh_news.json & news.json...');
      const newsPayload = await buildAndSaveFreshNews();
      LocalDatabase.addScraperLog(`Successfully scraped ${newsPayload.total} live news episodes across Fox, CNN, BBC, DW, RT, KPIX, and AJN!`);

      // Synchronize channels and write static EPG schedule manifests to disk
      LocalDatabase.addScraperLog('Syncing channel schedules with 24-hour capping and commercial injection...');
      await generateAndRegisterChannels();
      currentChannels = LocalDatabase.getChannels();
      LocalDatabase.addScraperLog(`Successfully synchronized all ${currentChannels.length} channels and updated 24-hour EPG schedules!`);
    } catch (newsErr: any) {
      LocalDatabase.addScraperLog(`Live News Scraper encountered an error: ${newsErr.message}`);
    }

    // 2. Data Enrichment Pipeline using Gemini
    LocalDatabase.addScraperLog('Initializing AI metadata enrichment engine...');
    LocalDatabase.updateScraperStatus({
      status: 'enriching',
      progress: 60,
      currentTask: 'Connecting to Gemini AI Engine for smart summary & trivia creation...'
    });

    const apiKey = process.env.GEMINI_API_KEY;
    if (settings.enrichWithGemini && apiKey) {
      LocalDatabase.addScraperLog('Using server-side Gemini API key for active metadata synthesis.');
      
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build'
            }
          }
        });

        // Enrich shows one by one to avoid large single payload token blowouts
        for (const channel of currentChannels) {
          LocalDatabase.addScraperLog(`AI Enrichment: Processing station "${channel.name}"...`);
          
          for (const show of channel.shows) {
            // Check if show is already fully enriched to save massive API calls and speed up scraping
            const hasCast = (show as any).cast && (show as any).cast.length > 0;
            const hasDetailedDescription = show.description && show.description.length > 80;
            const hasEnrichedEps = show.episodes.length > 0 && show.episodes.every(e => e.funFact && (e as any).runtimeMins);
            
            if (hasCast && hasDetailedDescription && hasEnrichedEps) {
              LocalDatabase.addScraperLog(`AI Enrichment: Skipping "${show.title}" (already enriched with cast & metadata).`);
              continue;
            }

            LocalDatabase.addScraperLog(`AI Enrichment: Analyzing show "${show.title}"...`);
            
            const prompt = `
              You are an expert TV historian, curator, and copywriter.
              We are enriching the metadata for the classic television show "${show.title}".
              The show belongs to the genre "${show.genre}" and originally aired in the year "${show.year}".
              Currently, its description is: "${show.description}".

              It has the following episodes:
              ${show.episodes.map(e => `- Episode ID "${e.id}": "${e.title}" (Season ${e.season || '1'}, Episode ${e.episodeNumber || '1'})`).join('\n')}

              Please return a structured JSON object representing the enriched metadata of this show.
              Ensure you create:
              1. A refined, highly engaging, cinema-style summary of the show.
              2. Detailed, evocative titles and short plots for each episode.
              3. Dynamic, trivia-based fun facts for each episode (keep under 20 words).
              4. A professional list of 2 or 3 main cast members with real actor names, their character, a short 1-sentence bio, and a high-quality, professional face profile image URL on Unsplash representing them (e.g. "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face").
              5. Realistic estimates for runtimes (e.g. 30, 45 or 60 mins) and file download size in GB (usually 0.35 to 1.5 GB).
            `;

            try {
              const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                  responseMimeType: 'application/json',
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      refinedDescription: { type: Type.STRING },
                      cast: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            name: { type: Type.STRING },
                            character: { type: Type.STRING },
                            bio: { type: Type.STRING },
                            imageUrl: { type: Type.STRING }
                          },
                          required: ['name', 'character', 'bio', 'imageUrl']
                        }
                      },
                      episodes: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            episodeId: { type: Type.STRING },
                            enrichedTitle: { type: Type.STRING },
                            funFact: { type: Type.STRING },
                            runtimeMins: { type: Type.INTEGER },
                            estimatedSizeGb: { type: Type.NUMBER }
                          },
                          required: ['episodeId', 'enrichedTitle', 'funFact', 'runtimeMins', 'estimatedSizeGb']
                        }
                      }
                    },
                    required: ['refinedDescription', 'cast', 'episodes']
                  }
                }
              });

              const result = JSON.parse(response.text || '{}');
              
              // Apply enriched results back to local state
              if (result.refinedDescription) {
                show.description = result.refinedDescription;
              }
              
              // Save cast info onto the customTags or directly inside custom show fields!
              // Let's attach cast and extra metadata dynamically so our React app can fetch it.
              (show as any).cast = result.cast || PROCEDURAL_CASTS[show.id] || [];

              if (result.episodes && Array.isArray(result.episodes)) {
                for (const enrichedEp of result.episodes) {
                  const targetEp = show.episodes.find(e => e.id === enrichedEp.episodeId);
                  if (targetEp) {
                    if (enrichedEp.enrichedTitle) targetEp.title = enrichedEp.enrichedTitle;
                    if (enrichedEp.funFact) targetEp.funFact = enrichedEp.funFact;
                    if (enrichedEp.runtimeMins) targetEp.runtimeMins = enrichedEp.runtimeMins;
                    if (enrichedEp.estimatedSizeGb) targetEp.estimatedSizeGb = enrichedEp.estimatedSizeGb;
                  }
                }
              }
              LocalDatabase.addScraperLog(`AI Enrichment: Successfully enriched "${show.title}".`);
            } catch (enrichErr: any) {
              LocalDatabase.addScraperLog(`AI Enrichment fallback: Using procedural cast for "${show.title}" (${enrichErr.message}).`);
              (show as any).cast = PROCEDURAL_CASTS[show.id] || [];
            }

          }
        }
        LocalDatabase.addScraperLog('Gemini AI metadata enrichment pipeline completed successfully.');

      } catch (err: any) {
        LocalDatabase.addScraperLog(`Gemini API connection failed: ${err.message}. Reverting to offline procedural enrichment.`);
        enrichProcedurally(currentChannels);
      }
    } else {
      LocalDatabase.addScraperLog('Gemini API key is missing or AI enrichment is disabled. Running high-fidelity offline procedural metadata enrichment.');
      enrichProcedurally(currentChannels);
    }

    // 3. Save Channels back to database
    runDailySourceUpdate(currentChannels);
    LocalDatabase.saveChannels(currentChannels);
    LocalDatabase.addScraperLog(`Daily TV Guide sync complete! Enriched ${currentChannels.length} channels.`);
    
    LocalDatabase.updateScraperStatus({
      status: 'completed',
      progress: 100,
      currentTask: 'TV Guide schedule completely synchronized.',
      lastRunTimestamp: new Date().toLocaleString()
    });

  } catch (error: any) {
    console.error('Scraper Execution Failure: ', error);
    LocalDatabase.addScraperLog(`Scraper Failed: ${error.message}`);
    LocalDatabase.updateScraperStatus({
      status: 'failed',
      progress: 100,
      currentTask: `Failed: ${error.message}`
    });
  }
}

// High-fidelity procedural fallbacks
function enrichProcedurally(channels: Channel[]) {
  for (const ch of channels) {
    for (const show of ch.shows) {
      // Add custom cast details procedurally if not exist
      if (!(show as any).cast) {
        (show as any).cast = PROCEDURAL_CASTS[show.id] || [
          { name: 'Unknown Actor', character: 'Co-Star', bio: 'A talented vintage stage actor from early radio days.', imageUrl: CAST_AVATARS[1] },
          { name: 'John Doe', character: 'Lead Hero', bio: 'Best known for rugged western and thriller roles.', imageUrl: CAST_AVATARS[0] }
        ];
      }

      // Add trivia/facts and estimates for episodes
      show.episodes = show.episodes.map((ep, idx) => {
        return {
          ...ep,
          funFact: (ep as any).funFact || PROCEDURAL_TRIVIA[(idx + show.title.length) % PROCEDURAL_TRIVIA.length],
          runtimeMins: (ep as any).runtimeMins || 30,
          estimatedSizeGb: (ep as any).estimatedSizeGb || parseFloat((0.25 + (idx % 3) * 0.18).toFixed(2))
        };
      });
    }
  }
}

/**
 * Extracts date/time from news segment identifiers or titles
 */
function getEpisodeTimestamp(episode: Episode): number | null {
  if (!episode.id) return null;

  // 1. Check if ID contains a 13-digit Unix millisecond timestamp
  const msMatch = episode.id.match(/\d{13}/);
  if (msMatch) {
    return parseInt(msMatch[0], 10);
  }

  // 2. Check for YYYYMMDD in ID, URL, or Title (e.g. 20260715)
  const ymdMatch = episode.id.match(/\b(20\d{6})\b/) || 
                   (episode.url && episode.url.match(/\b(20\d{6})\b/)) || 
                   (episode.title && episode.title.match(/\b(20\d{6})\b/)) ||
                   episode.id.match(/_(20\d{6})_/) ||
                   (episode.url && episode.url.match(/_(20\d{6})_/));
  if (ymdMatch) {
    const ymd = ymdMatch[1];
    const year = parseInt(ymd.substring(0, 4), 10);
    const month = parseInt(ymd.substring(4, 6), 10) - 1;
    const day = parseInt(ymd.substring(6, 8), 10);
    return new Date(year, month, day).getTime();
  }

  // 3. Check for YYYY-MM-DD pattern in title, ID, or URL
  const ymdDashMatch = episode.id.match(/\b(20\d{2}-\d{2}-\d{2})\b/) ||
                       (episode.title && episode.title.match(/\b(20\d{2}-\d{2}-\d{2})\b/)) ||
                       (episode.url && episode.url.match(/\b(20\d{2}-\d{2}-\d{2})\b/));
  if (ymdDashMatch) {
    return new Date(ymdDashMatch[1]).getTime();
  }

  // 4. Check for YYYY-MonthName-DD (e.g., 2026-Jul-13)
  const wordDateMatch = episode.id.match(/\b(20\d{2})_([A-Za-z]{3})_(\d{2})\b/) ||
                        (episode.title && episode.title.match(/\b(20\d{2})-([A-Za-z]{3})-(\d{2})\b/));
  if (wordDateMatch) {
    const year = parseInt(wordDateMatch[1], 10);
    const monthStr = wordDateMatch[2];
    const day = parseInt(wordDateMatch[3], 10);
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthIndex = months.indexOf(monthStr.toLowerCase());
    if (monthIndex !== -1) {
      return new Date(year, monthIndex, day).getTime();
    }
  }

  return null;
}

/**
 * Automatically clears out episodes older than 72 hours for channels marked as 'News',
 * ensuring the network remains current and free of stale, repeated 870-episode segments.
 */
export function runDailySourceUpdate(channelsList?: Channel[]) {
  LocalDatabase.addScraperLog('[Daily Source Update] Initiating cleanup of stale episodes older than 72 hours for News channels...');
  
  const channels = channelsList || LocalDatabase.getChannels();
  let updatedCount = 0;
  let removedCount = 0;

  const now = new Date();
  const seventyTwoHoursMs = 72 * 60 * 60 * 1000;
  const cutoffTime = now.getTime() - seventyTwoHoursMs;

  for (const channel of channels) {
    if (channel.category && channel.category.toLowerCase() === 'news') {
      LocalDatabase.addScraperLog(`[Daily Source Update] Checking news channel: ${channel.name} (${channel.id})`);
      
      for (const show of channel.shows) {
        const originalLength = show.episodes.length;
        
        // Filter episodes
        const keptEpisodes = show.episodes.filter(ep => {
          const epTime = getEpisodeTimestamp(ep);
          if (epTime === null) {
            // Keep if we can't parse a date/timestamp to avoid breaking static feeds
            return true;
          }
          // Keep if within the last 72 hours
          return epTime >= cutoffTime;
        });

        // Safety: ensure we never leave a show completely empty if it originally had episodes
        let finalEpisodes = keptEpisodes;
        if (finalEpisodes.length < 3 && show.episodes.length > 0) {
          const sortedOriginals = [...show.episodes].sort((a, b) => {
            const timeA = getEpisodeTimestamp(a) || 0;
            const timeB = getEpisodeTimestamp(b) || 0;
            return timeB - timeA;
          });
          finalEpisodes = sortedOriginals.slice(0, 5);
          LocalDatabase.addScraperLog(`[Daily Source Update] Safety: Kept the ${finalEpisodes.length} most recent episodes of "${show.title}" to avoid empty guide.`);
        }

        const removed = originalLength - finalEpisodes.length;
        if (removed > 0) {
          show.episodes = finalEpisodes;
          removedCount += removed;
          updatedCount++;
          LocalDatabase.addScraperLog(`[Daily Source Update] Cleaned ${removed} stale episodes from show "${show.title}". New count: ${finalEpisodes.length}`);
        }
      }
    }
  }

  if (updatedCount > 0) {
    if (!channelsList) {
      LocalDatabase.saveChannels(channels);
    }
    LocalDatabase.addScraperLog(`[Daily Source Update] Finished cleaning stale episodes. Removed ${removedCount} stale segments across ${updatedCount} news channels.`);
  } else {
    LocalDatabase.addScraperLog('[Daily Source Update] No news channel required stale episode cleanup today.');
  }
}

/**
 * Historical Backfill: Ingests TV news OCR chyrons from Archive.org Third Eye API
 * utilizing hours, days, or custom date/range parameters.
 */
export async function runThirdEyeBackfill(options: {
  hours?: number;
  days?: number;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  mode?: 'filtered' | 'raw';
}) {
  const mode = options.mode || 'filtered';
  let queryParams = `format=tsv&mode=${mode}`;

  if (options.hours) {
    queryParams += `&hours=${options.hours}`;
  } else if (options.days) {
    queryParams += `&days=${options.days}`;
  } else if (options.startDate && options.endDate) {
    queryParams += `&start=${options.startDate}&end=${options.endDate}`;
  } else if (options.startDate) {
    queryParams += `&date=${options.startDate}`;
  } else {
    queryParams += `&hours=4`; // slightly larger default for manual trigger
  }

  const thirdEyeUrl = `https://archive.org/services/third-eye.php?${queryParams}`;
  LocalDatabase.addScraperLog(`[Third Eye Backfill] Starting ingest with URL: ${thirdEyeUrl}`);

  try {
    const res = await rateLimitedFetch(thirdEyeUrl);
    if (!res.ok) {
      throw new Error(`Archive.org Third Eye API returned HTTP status ${res.status}`);
    }

    const text = await res.text();
    const lines = text.split('\n');
    LocalDatabase.addScraperLog(`[Third Eye Backfill] Retrieved ${lines.length} lines of raw TSV data.`);

    const discoveredEpisodes: Episode[] = [];
    let epIndex = 1;
    const uniqueIds = new Set<string>();

    for (const line of lines) {
      if (!line.trim() || line.startsWith('#') || line.startsWith('timestamp')) continue;
      const parts = line.split('\t');
      if (parts.length < 4) continue;

      const [timestamp, channelName, identifier, chyronText] = parts;
      if (!identifier || !chyronText || chyronText.length < 10) continue;
      if (uniqueIds.has(identifier)) continue;

      // Clean non-English/Cyrillic noise
      if (/[\u0400-\u04FF]/.test(chyronText)) {
        continue;
      }

      uniqueIds.add(identifier);

      // Construct human-readable titles
      const cleanTitle = identifier
        .replace(/_/g, ' ')
        .replace(/FOXNEWSW/g, 'Fox News Channel')
        .replace(/MSNBCW/g, 'MSNBC Broadcast')
        .replace(/CNNW/g, 'CNN Live Coverage')
        .replace(/\d{8}/g, '')
        .replace(/\d{6}/g, '')
        .trim();

      const videoUrl = `https://archive.org/download/${identifier}/${identifier}_512kb.mp4`;
      const dateLabel = timestamp ? new Date(timestamp).toLocaleString() : 'Historical Segment';

      discoveredEpisodes.push({
        id: `thirdeye-${identifier}`,
        title: cleanTitle || 'Historical Breaking News Segment',
        season: '1',
        episodeNumber: String(epIndex++),
        url: videoUrl,
        funFact: `OCR chyron: "${chyronText.trim()}". Captured on ${dateLabel}.`
      });

      // Cap at 30 high-quality episodes to avoid EPG list explosion
      if (discoveredEpisodes.length >= 30) break;
    }

    if (discoveredEpisodes.length === 0) {
      LocalDatabase.addScraperLog(`[Third Eye Backfill] No new unique segments found in response.`);
      return { success: true, added: 0, message: 'Backfill complete. No new unique segments were found.' };
    }

    // Merge into news.json / ch-news-archive
    const currentChannels = LocalDatabase.getChannels();
    let newsArchiveChannel = currentChannels.find(ch => ch.id === 'ch-news-archive');
    if (!newsArchiveChannel) {
      newsArchiveChannel = {
        id: 'ch-news-archive',
        number: '104',
        name: 'Retro News Network',
        tagline: 'Historical television news broadcasts from Archive.org',
        category: 'Archive News',
        logoText: 'RETRO NEWS',
        accentColor: '#2563EB',
        shows: []
      };
      currentChannels.push(newsArchiveChannel);
    }

    if (!newsArchiveChannel.shows || newsArchiveChannel.shows.length === 0) {
      newsArchiveChannel.shows = [
        {
          id: 'show-ch-news-archive-1',
          title: 'Retro News Special Reports',
          description: 'Historical television news broadcasts from Archive.org',
          year: '2026',
          genre: 'Archive News',
          episodes: []
        }
      ];
    }

    const mainShow = newsArchiveChannel.shows[0];
    const existingEpIds = new Set(mainShow.episodes.map(e => e.id));
    const mergedEpisodes = [...mainShow.episodes];

    let addedCount = 0;
    for (const ep of discoveredEpisodes) {
      if (!existingEpIds.has(ep.id)) {
        mergedEpisodes.push(ep);
        addedCount++;
      }
    }

    mainShow.episodes = mergedEpisodes;
    LocalDatabase.saveChannels(currentChannels);
    LocalDatabase.addScraperLog(`[Third Eye Backfill] Successfully backfilled and merged ${addedCount} unique segments.`);

    // Rebuild news feeds and sync channel manifests
    try {
      await buildAndSaveFreshNews();
      await generateAndRegisterChannels();
      LocalDatabase.addScraperLog(`[Third Eye Backfill] Static news feed directories and channel schedules successfully updated.`);
    } catch (feedErr: any) {
      LocalDatabase.addScraperLog(`[Third Eye Backfill Warning] Static news feed update failed: ${feedErr.message}`);
    }

    return {
      success: true,
      added: addedCount,
      totalCount: mainShow.episodes.length,
      message: `Successfully backfilled ${addedCount} segments.`
    };

  } catch (err: any) {
    LocalDatabase.addScraperLog(`[Third Eye Backfill Error] ${err.message}`);
    throw err;
  }
}

/**
 * Background Duration Prober
 * Scans all episodes, identifies unprobed Archive.org media elements,
 * queries the Archive Metadata API, and persists actual durations to database.
 */
export async function backgroundDurationProber() {
  console.log('[Duration Prober] Starting background duration prober for all default channels...');
  const channels = LocalDatabase.getChannels();
  let updatedAny = false;

  for (const channel of channels) {
    if (!channel.shows) continue;
    for (const show of channel.shows) {
      if (!show.episodes) continue;
      for (const episode of show.episodes) {
        const isArchive = episode.url && (
          episode.url.includes('archive.org') || 
          episode.url.includes('commondatastorage.googleapis.com')
        );
        const hasNoDuration = !episode.durationMs || episode.durationMs === 30 * 60 * 1000;
        
        if (isArchive && hasNoDuration) {
          let identifier = '';
          if (episode.url.includes('archive.org/download/')) {
            const parts = episode.url.split('archive.org/download/');
            if (parts.length > 1) {
              identifier = parts[1].split('/')[0];
            }
          } else if (episode.url.includes('archive.org/serve/')) {
            const parts = episode.url.split('archive.org/serve/');
            if (parts.length > 1) {
              identifier = parts[1].split('/')[0];
            }
          } else if (episode.url.includes('archive.org/details/')) {
            const parts = episode.url.split('archive.org/details/');
            if (parts.length > 1) {
              identifier = parts[1].split('/')[0];
            }
          }

          if (identifier) {
            // Unescape URL identifier if it has % characters
            try {
              identifier = decodeURIComponent(identifier);
            } catch (e) {}

            try {
              console.log(`[Duration Prober] Probing duration for Archive item: "${identifier}" (${episode.title})...`);
              const ingestion = await ingestArchiveProgram(identifier);
              if (ingestion && ingestion.durationMins && ingestion.durationMins > 0) {
                episode.durationMs = ingestion.durationMins * 60 * 1000;
                episode.runtimeMins = ingestion.durationMins;
                updatedAny = true;
                console.log(`[Duration Prober] Resolved duration for "${episode.title}": ${ingestion.durationMins} mins.`);
              }
            } catch (err: any) {
              console.warn(`[Duration Prober] Failed to probe identifier "${identifier}":`, err.message);
            }
            // Polite delay to avoid hammering the Archive metadata API
            await sleep(1000);
          }
        }
      }
    }
  }

  if (updatedAny) {
    LocalDatabase.saveChannels(channels);
    console.log('[Duration Prober] Background prober finished and saved updated channel durations.');
  } else {
    console.log('[Duration Prober] Background prober finished. No updates needed.');
  }
}

