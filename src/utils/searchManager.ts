/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Channel, Show, Episode } from '../types';
import { getFutureScheduleForChannel, ScheduleSlot } from './scheduler';

export interface SearchIndexItem {
  cleanTitle: string;
  showTitle: string;
  channelId: string;
  channelName: string;
}

export class MasterSearchManager {
  private channels: Record<string, Channel> = {};
  private globalSearchIndex: SearchIndexItem[] = [];

  /**
   * Parses standard, mixed, or single-show M3U playlist file texts
   */
  public ingestM3UPlaylist(channelId: string, channelName: string, rawM3U: string): void {
    const lines = rawM3U.split('\n');
    const showsMap: Record<string, Episode[]> = {};

    let currentMeta: { title: string; durationMs: number } | null = null;

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      if (line.startsWith('#EXTINF:')) {
        const infoPart = line.substring(8);
        const commaIndex = infoPart.lastIndexOf(',');
        const fullTitle = commaIndex !== -1 ? infoPart.substring(commaIndex + 1).trim() : "Unknown Broadcast";
        
        // Dynamic duration check
        let durationSec = parseInt((infoPart || '').split(',')[0], 10);
        if (isNaN(durationSec) || durationSec <= 0) {
          durationSec = fullTitle.toLowerCase().includes("columbo") ? 5400 : 1800;
        }

        currentMeta = { title: fullTitle, durationMs: durationSec * 1000 };
      } else if (!line.startsWith('#') && currentMeta) {
        // Simple name deduction logic (splits "Columbo - S01E01" down to "Columbo")
        const showKey = (currentMeta.title && typeof currentMeta.title === 'string')
          ? currentMeta.title.split(/[:\-–]/)[0].trim()
          : "Unknown Show";
        
        const episodeEntry: Episode = {
          id: `${channelId}_${Math.random().toString(36).substr(2, 9)}`,
          title: currentMeta.title,
          url: line,
          durationMs: currentMeta.durationMs
        };

        if (!showsMap[showKey]) showsMap[showKey] = [];
        showsMap[showKey].push(episodeEntry);

        // Map to global text lookup index
        this.globalSearchIndex.push({
          cleanTitle: currentMeta.title.toLowerCase(),
          showTitle: showKey,
          channelId,
          channelName
        });

        currentMeta = null;
      }
    }

    const constructedShows: Show[] = Object.entries(showsMap).map(([title, episodes]) => ({
      id: `show_${Math.random().toString(36).substr(2, 9)}`,
      title,
      description: `Continuous broadcast of ${title}`,
      year: new Date().getFullYear().toString(),
      genre: 'General',
      episodes
    }));

    this.channels[channelId] = {
      id: channelId,
      name: channelName,
      shows: constructedShows,
      number: '999',
      tagline: 'M3U Ingested Broadcast',
      category: 'Ingested',
      logoText: 'M3U',
      accentColor: '#10b981'
    };
  }

  /**
   * Fast text input auto-suggestions
   */
  public getAutofill(query: string, limit = 6): SearchIndexItem[] {
    const cleanQuery = query.toLowerCase().trim();
    if (!cleanQuery) return [];

    return this.globalSearchIndex
      .filter(item => item.cleanTitle.includes(cleanQuery))
      .slice(0, limit);
  }

  /**
   * Aggregates future matching instances up to 30 days away
   */
  public searchFutureAirings(query: string, daysAhead = 0): Array<ScheduleSlot & { channelName: string }> {
    const cleanQuery = query.toLowerCase().trim();
    const matches: Array<ScheduleSlot & { channelName: string }> = [];

    for (const channel of Object.values(this.channels)) {
      const schedule = getFutureScheduleForChannel(channel, daysAhead);
      
      schedule.forEach(slot => {
        if (
          slot.show.title.toLowerCase().includes(cleanQuery) || 
          slot.episode.title.toLowerCase().includes(cleanQuery)
        ) {
          matches.push({
            ...slot,
            channelName: channel.name
          });
        }
      });
    }

    return matches;
  }

  public getChannelData(channelId: string): Channel | undefined {
    return this.channels[channelId];
  }
}
