/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Channel, Show, Episode } from '../types';
import { flattenChannelPlaylist } from './scheduler';

export interface MasterPlaylistItem {
  title: string;
  url: string;
  duration: number; // Duration in seconds
  showId?: string;
  episodeId?: string;
}

export interface MasterPlaylistChannel {
  name: string;
  schedule_cycle_duration_seconds?: number;
  playlist: MasterPlaylistItem[];
}

export interface MasterPlaylistData {
  channels: Record<string, MasterPlaylistChannel>;
}

/**
 * Parses Master Playlist JSON content and converts it into standard Channel objects.
 * This bridges the massive master file structure directly into our React EPG structure.
 */
export function parseMasterPlaylistJSON(text: string, filename: string = 'master_playlist.json'): Channel[] {
  try {
    const data: MasterPlaylistData = JSON.parse(text);
    if (!data || !data.channels) {
      throw new Error("Invalid structure: 'channels' root object is missing.");
    }

    const channels: Channel[] = [];
    let channelCounter = 1;

    Object.entries(data.channels).forEach(([key, chData]) => {
      const name = chData.name || key;
      const playlist = chData.playlist || [];

      // Create a unified show containing all playlist episodes
      const episodes: Episode[] = playlist.map((item, idx) => {
        return {
          id: `ep-json-${key}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
          title: item.title || `Segment #${idx + 1}`,
          url: item.url,
          runtimeMins: (item.duration || 1800) / 60, // Convert seconds to minutes for EPG compatibility
          durationMs: (item.duration || 1800) * 1000,
          funFact: `Synchronized broadcast segment. Precision Loop Duration: ${item.duration} seconds.`
        };
      });

      const show: Show = {
        id: `show-json-${key}-${Math.random().toString(36).substr(2, 5)}`,
        title: name,
        description: `Precision Epoch-synchronized broadcast network containing ${playlist.length} programmed segments.`,
        year: new Date().getFullYear().toString(),
        genre: 'Variety',
        episodes
      };

      const colorPalette = ['#d97706', '#9333ea', '#16a34a', '#2563eb', '#db2777', '#06b6d4', '#f43f5e'];
      const accentColor = colorPalette[Math.floor(Math.random() * colorPalette.length)];

      channels.push({
        id: `ch-json-${key}-${Math.random().toString(36).substr(2, 5)}`,
        number: String(300 + channelCounter),
        name,
        tagline: `Epoch Sync Loop • Cycle: ${chData.schedule_cycle_duration_seconds || playlist.reduce((a, b) => a + b.duration, 0)}s`,
        category: 'Master Playlists',
        logoText: name.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'JSON',
        accentColor,
        shows: [show],
        status: 'unchecked'
      });

      channelCounter++;
    });

    return channels;
  } catch (err: any) {
    console.error('Error parsing Master Playlist JSON:', err);
    throw new Error(`Master Playlist JSON Parsing Failed: ${err.message}`);
  }
}

/**
 * The Broadcast Synchronization Engine
 * Calculates the loop and current runtime offset based on absolute real-world time (Date.now()).
 * Achieves a mathematically synchronized "live television" broadcast effect across user sessions.
 */
export class VirtualBroadcastEngine {
  private channel: Channel;
  private totalCycleDurationMs: number = 0;
  private flatPlaylist: Array<{ durationMs: number; episode: Episode; show: Show; isCommercialFill?: boolean }> = [];

  constructor(channel: Channel, enableInterstitials: boolean = true) {
    this.channel = channel;
    this.flattenPlaylist(enableInterstitials);
  }

  private flattenPlaylist(enableInterstitials: boolean = true) {
    if (!this.channel.shows || this.channel.shows.length === 0) {
      return;
    }

    try {
      this.flatPlaylist = flattenChannelPlaylist(this.channel, { enableInterstitials });
      this.totalCycleDurationMs = this.flatPlaylist.reduce((acc, item) => acc + item.durationMs, 0);
    } catch (err) {
      console.warn('Failed to flatten playlist in VirtualBroadcastEngine:', err);
      this.flatPlaylist = [];
      this.totalCycleDurationMs = 0;
    }
  }

  /**
   * Tracks the absolute current frame of the broadcast loop using Epoch modulo arithmetic.
   * Returns the exact videoIndex and the precise seekToSeconds inside that video.
   */
  public getLivePlaybackState(timestampMs: number): { videoIndex: number; seekToSeconds: number } {
    if (this.totalCycleDurationMs === 0 || this.flatPlaylist.length === 0) {
      return { videoIndex: 0, seekToSeconds: 0 };
    }

    // Wrap the absolute timestamp within the loop's total duration window
    const currentCycleOffsetMs = timestampMs % this.totalCycleDurationMs;
    let accumulatedTimeMs = 0;

    for (let i = 0; i < this.flatPlaylist.length; i++) {
      const item = this.flatPlaylist[i];
      if (currentCycleOffsetMs < accumulatedTimeMs + item.durationMs) {
        return {
          videoIndex: i,
          seekToSeconds: (currentCycleOffsetMs - accumulatedTimeMs) / 1000,
        };
      }
      accumulatedTimeMs += item.durationMs;
    }

    return { videoIndex: 0, seekToSeconds: 0 };
  }
}
