import { parseMediaItem, ParsedMediaMetadata } from './genreParser';
import { globalPlaylistVault } from './playlistVault';

export interface ChannelGroup {
  channelId: string;
  channelName: string;
  category: string;
  items: ParsedMediaMetadata[];
}

// In-memory cache for news datasets to eliminate main-thread re-parsing lockup on channel switch
const newsDataCache: Record<string, any[]> = {};

export async function getOrFetchNewsDataset(filename: 'news.json' | 'fresh_news.json'): Promise<any[]> {
  if (newsDataCache[filename]) {
    return newsDataCache[filename];
  }
  try {
    const res = await fetch(`/${filename}`);
    if (res.ok) {
      const data = await res.json();
      const episodes = data?.episodes || (Array.isArray(data) ? data : []);
      newsDataCache[filename] = episodes;
      return episodes;
    }
  } catch (e) {
    console.warn(`[Channel Engine]: Failed to pre-fetch dataset ${filename}:`, e);
  }
  return [];
}

export function setNewsDatasetCache(filename: 'news.json' | 'fresh_news.json', episodes: any[]) {
  newsDataCache[filename] = episodes;
}

export const newsChannels = [
  {
    id: "ch-news-archive",
    number: "104",
    name: "Retro News Network",
    category: "Archive News",
    sourceFile: "news.json",
    description: "Historical television news broadcasts from Archive.org"
  },
  {
    id: "ch-news-current",
    number: "105",
    name: "Headline News Today",
    category: "Current Events",
    sourceFile: "fresh_news.json",
    description: "Continuous daily updated global news updates"
  }
];

export function buildChannelGroups(rawPlaylistItems: { title: string; url: string }[]): Record<string, ChannelGroup> {
  // Populate global segregated playlist vaults
  globalPlaylistVault.populateSegregatedVaults(rawPlaylistItems);

  const groups: Record<string, ChannelGroup> = {
    'ch-wstn-101': { channelId: 'ch-wstn-101', channelName: 'Classic Westerns HD', category: 'Westerns', items: [] },
    'ch-crime-102': { channelId: 'ch-crime-102', channelName: 'Classic Cinema & TV Crime', category: 'Crime', items: [] },
    'ch-comedy-103': { channelId: 'ch-comedy-103', channelName: 'Classic Sitcoms & Comedy', category: 'Comedy', items: [] },
    'ch-news-archive': { channelId: 'ch-news-archive', channelName: 'Retro News Network', category: 'Archive News', items: [] },
    'ch-news-current': { channelId: 'ch-news-current', channelName: 'Headline News Today', category: 'Current Events', items: [] },
    'ch-master-shuffle': { channelId: 'ch-master-shuffle', channelName: 'Master Showcase (All Combined)', category: 'General', items: [] },
  };

  for (const rawItem of rawPlaylistItems) {
    const parsed = parseMediaItem(rawItem.title);

    // Add to specific genre channel
    if (groups[parsed.suggestedChannelId]) {
      groups[parsed.suggestedChannelId].items.push(parsed);
    }

    // Add every item to the Master Showcase Channel pool
    groups['ch-master-shuffle'].items.push(parsed);
  }

  return groups;
}

