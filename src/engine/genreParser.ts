export interface ParsedMediaMetadata {
  rawTitle: string;
  cleanTitle: string;
  genre: 'WESTERN' | 'CRIME' | 'COMEDY' | 'NEWS' | 'GENERAL';
  suggestedChannelId: string;
}

// Genre Keyword Mappings & Override Rules
const GENRE_RULES = [
  {
    genre: 'WESTERN' as const,
    channelId: 'ch-wstn-101',
    keywords: [
      'have gun', 'ella west', 'paladin', 'rawhide', 'death valley', 'gunsmoke', 'bonanza', 
      'rifleman', 'the rifleman', 'wagon train', 'maverick', 'point blank', 'bat masterson', 
      'branded', 'lawman', 'wells fargo', 'tales of wells fargo', 'wanted dead', 'cisco kid', 
      'lone ranger', 'cheyenne', 'virginian', 'the virginian', 'laramie', 'zorro', 'daniel boone', 
      'big valley', 'the big valley', 'high chaparral', 'the high chaparral'
    ],
  },
  {
    genre: 'CRIME' as const,
    channelId: 'ch-crime-102',
    keywords: [
      'columbo', 'hawaii five', 'fugitive', 'the fugitive', 'dragnet', 'perry mason', 'unsolved mysteries', 
      'kojak', 'the untouchables', 'sopranos', 'naked city', 'man with a camera', 'johnny staccato', 
      '21 jump street', 'cagney', 'barnaby jones', 'hunter', 'mod squad', 'police woman', 'the fbi', 
      'gotham', 'cannon', 'barney miller', 'mission impossible', 'murder she wrote', 'adam 12', 'brooklyn nine'
    ],
  },
  {
    genre: 'COMEDY' as const,
    channelId: 'ch-comedy-103',
    keywords: ["hogan's heroes", 'hogans heroes', 'i love lucy', 'bewitched', 'the honeymooners', 'gomer pyle', 'get smart', 'gilligan'],
  },
  {
    genre: 'NEWS' as const,
    channelId: 'ch-news-archive',
    keywords: ['9/11', 'september 11', 'abc news', 'cbs news', 'nbc news', 'cnn', 'fox 5', 'fox news', 'bbc', 'special report', 'bulletin', 'dw news', 'rt news'],
  },
];

/**
 * Parses raw file names or M3U titles into normalized show names and assigns exact genre groupings.
 */
export function parseMediaItem(rawTitle: string): ParsedMediaMetadata {
  const normalized = rawTitle.replace(/_/g, ' ');
  const lower = normalized.toLowerCase();

  // Strip file extensions, brackets, and common resolution tags
  let cleanTitle = normalized
    .replace(/\.(mp4|mkv|m3u8|avi|ts|mpg)$/i, '')
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .replace(/720p|1080p|hd|rip|x264|x265/gi, '')
    .trim();

  // Match against explicit taxonomy rules
  for (const rule of GENRE_RULES) {
    if (rule.keywords.some((keyword) => lower.includes(keyword))) {
      return {
        rawTitle,
        cleanTitle,
        genre: rule.genre,
        suggestedChannelId: rule.channelId,
      };
    }
  }

  // Fallback for unclassified TV/Cinema
  return {
    rawTitle,
    cleanTitle,
    genre: 'GENERAL',
    suggestedChannelId: 'ch-master-shuffle',
  };
}
