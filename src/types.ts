/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Episode {
  id: string;
  title: string;
  season?: string;
  episodeNumber?: string;
  url: string;
  subtitleUrl?: string;
  thumbnailUrl?: string;
  // Enriched metadata from scrapers & Gemini API
  funFact?: string;
  runtimeMins?: number;
  durationMs?: number;  // Crucial: Holds precision M3U stream runtime lengths
  isFiller?: boolean;
  estimatedSizeGb?: number;
  meta?: Record<string, any>;
}

export interface SubtitleCue {
  id: string;
  start: number; // in seconds
  end: number;   // in seconds
  text: string;
}

export interface Show {
  id: string;
  title: string;
  description: string;
  year: string;
  genre: string;
  episodes: Episode[];
  bannerUrl?: string;
  // Enriched cast listings from scrapers & Gemini API
  cast?: Array<{
    name: string;
    character: string;
    bio: string;
    imageUrl: string;
  }>;
}

export interface Channel {
  id: string;
  number: string;
  name: string;
  tagline: string;
  category: string; // Made generic to support flexible group names
  logoText: string;
  accentColor: string;
  shows: Show[];
  url?: string; // Standard M3U URL
  backupUrls?: string[]; // Multiple backup URLs
  customTags?: Record<string, string>; // Support for non-standard M3U tags
  status?: 'working' | 'broken' | 'unchecked' | 'checking'; // Validation status
  logoUrl?: string; // tvg-logo or logo image URL
  m3uUrl?: string; // M3U playlist file path or URL
  favorite?: boolean; // User favorite channel status
  isWestern?: boolean; // Western channel indicator
}

export interface PlaybackLog {
  id: string;
  timestamp: string;
  type: 'playing' | 'waiting' | 'stalled' | 'error' | 'epg' | 'custom';
  message: string;
  meta?: {
    time?: number;
    buffered?: number;
    readyState?: number;
    channelId?: string;
    episodeId?: string;
  };
}
