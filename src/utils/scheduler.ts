/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Channel, Episode, Show } from '../types';
import { VirtualBroadcastEngine } from './broadcastEngine';
import { selectFillersForGap, FillerTrack } from './fillerManager';

export interface ScheduleItem {
  id: string;
  title: string;
  url: string;
  durationSeconds: number;
  isInterstitial?: boolean;
}

export function buildBufferedShowBlock(
  episode: ScheduleItem, 
  targetBlockDurationSec: number, 
  commercialPool: ScheduleItem[]
): ScheduleItem[] {
  const block: ScheduleItem[] = [episode];
  let currentDuration = episode.durationSeconds;

  while (currentDuration < targetBlockDurationSec && commercialPool.length > 0) {
    // Pick commercial item that best fits the remaining gap
    const remainingSec = targetBlockDurationSec - currentDuration;
    const filler = commercialPool.find(c => c.durationSeconds <= remainingSec) || commercialPool[0];

    block.push({ ...filler, isInterstitial: true });
    currentDuration += filler.durationSeconds;
  }

  return block;
}

export interface ScheduleSlot {
  timeLabel: string;
  show: Show;
  episode: Episode;
  startTimeMs: number;
  endTimeMs: number;
  isCommercialFill?: boolean;
}

export interface FlatPlaylistItem {
  show: Show;
  episode: Episode;
  durationMs: number;
  isCommercialFill?: boolean;
}

function getNumericVal(str: string | undefined, defaultVal: number): number {
  if (!str) return defaultVal;
  const parsed = parseInt(str.replace(/\D/g, ''), 10);
  return isNaN(parsed) ? defaultVal : parsed;
}

export function flattenChannelPlaylist(
  channel: Channel,
  options: { enableInterstitials?: boolean; targetGridMins?: number } = {}
): FlatPlaylistItem[] {
  const { enableInterstitials = true, targetGridMins = 30 } = options;

  if (!channel.shows || channel.shows.length === 0) {
    throw new Error(`Channel ${channel.name} has no shows!`);
  }

  // 1. Sort shows alphabetically by title to ensure logical, deterministic ordering
  const sortedShows = [...channel.shows].sort((a, b) => a.title.localeCompare(b.title));

  // 2. Sort episodes within each show logically by season and episode number
  const showQueues = sortedShows.map((show) => {
    const sortedEps = [...(show.episodes || [])].sort((a, b) => {
      const sA = getNumericVal(a.season, 1);
      const sB = getNumericVal(b.season, 1);
      if (sA !== sB) return sA - sB;
      const eA = getNumericVal(a.episodeNumber, 1);
      const eB = getNumericVal(b.episodeNumber, 1);
      return eA - eB;
    });
    
    return sortedEps.map((episode) => {
      const durationMs = episode.durationMs || 
                         (episode.runtimeMins ? episode.runtimeMins * 60 * 1000 : 30 * 60 * 1000);
      return { show, episode, durationMs };
    });
  });

  // 3. Perform a fair-balanced, round-robin distribution to weave primary show episodes
  const primaryItems: FlatPlaylistItem[] = [];
  let hasMore = true;
  let index = 0;
  while (hasMore) {
    hasMore = false;
    for (let q = 0; q < showQueues.length; q++) {
      if (index < showQueues[q].length) {
        primaryItems.push(showQueues[q][index]);
        hasMore = true;
      }
    }
    index++;
  }

  if (primaryItems.length === 0) {
    throw new Error(`Channel ${channel.name} has no episodes!`);
  }

  // 4. If interstitials are disabled, return primary items directly
  if (!enableInterstitials) {
    return primaryItems;
  }

  // 5. Interstitial Commercial Fill Algorithm
  // Aligns primary show runtimes to standard TV program slot boundaries (e.g., 30m or 60m blocks)
  const gridSlotUnitMs = targetGridMins * 60 * 1000; // default 1,800,000 ms (30 mins)
  const finalPlaylist: FlatPlaylistItem[] = [];

  primaryItems.forEach((item, itemIdx) => {
    // Push the primary show episode first
    finalPlaylist.push(item);

    // Calculate grid alignment target, but cap commercial break fill duration to at most 60 seconds
    // to ensure channels play primary shows continuously without wall-to-wall commercial blocks.
    const targetSlotMs = Math.max(gridSlotUnitMs, Math.ceil(item.durationMs / gridSlotUnitMs) * gridSlotUnitMs);
    const rawGapMs = targetSlotMs - item.durationMs;
    const gapMs = Math.min(rawGapMs, 60000); // Cap commercial station break to max 60s (1-2 quick ads)

    // If there is a gap of 10s or more, query the filler pool for 1-2 brief station commercials
    if (gapMs >= 10000) {
      const selectedFillers = selectFillersForGap(gapMs, itemIdx * 13 + item.durationMs).slice(0, 2);

      const stationBreakShow: Show = {
        id: `show-commercials-${channel.id}`,
        title: 'Station Break',
        description: 'Vintage station commercials, promos, and network interstitials.',
        year: '1970',
        genre: 'Commercials',
        episodes: []
      };

      selectedFillers.forEach((filler, fIdx) => {
        const commercialEpisode: Episode = {
          id: `ep-commercial-${filler.id}-${itemIdx}-${fIdx}`,
          title: `Station Break • ${filler.title}`,
          season: '1',
          episodeNumber: String(fIdx + 1),
          url: filler.url,
          durationMs: filler.durationMs,
          runtimeMins: filler.durationSec / 60,
          funFact: `Vintage Station Commercial Interstitial (${filler.durationSec}s). Aligned to ${targetGridMins}-min TV broadcast grid.`
        };

        finalPlaylist.push({
          show: stationBreakShow,
          episode: commercialEpisode,
          durationMs: filler.durationMs,
          isCommercialFill: true
        });
      });
    }
  });

  return finalPlaylist;
}

export function getLiveEpisodeForChannel(channel: Channel, timestampMs: number) {
  const playlistItems = flattenChannelPlaylist(channel);
  const engine = new VirtualBroadcastEngine(channel);
  const liveState = engine.getLivePlaybackState(timestampMs);

  const currentSlotIndex = liveState.videoIndex;
  const currentItem = playlistItems[currentSlotIndex] || playlistItems[0];
  const seekOffsetSeconds = liveState.seekToSeconds;
  
  const currentDurationMs = currentItem.durationMs;
  const seekOffsetMs = seekOffsetSeconds * 1000;
  const remainingSeconds = (currentDurationMs - seekOffsetMs) / 1000;

  const currentSlotStartTimeMs = timestampMs - seekOffsetMs;
  const currentSlotEndTimeMs = currentSlotStartTimeMs + currentDurationMs;

  const currentSlot: ScheduleSlot = {
    timeLabel: new Date(currentSlotStartTimeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    show: currentItem.show,
    episode: currentItem.episode,
    startTimeMs: currentSlotStartTimeMs,
    endTimeMs: currentSlotEndTimeMs,
    isCommercialFill: currentItem.isCommercialFill,
  };

  const upcomingSlots: ScheduleSlot[] = [];
  let nextSlotStartTimeMs = currentSlotEndTimeMs;
  let offsetIndex = 1;
  while (upcomingSlots.length < 4 && offsetIndex < playlistItems.length) {
    const nextIndex = (currentSlotIndex + offsetIndex) % playlistItems.length;
    const nextItem = playlistItems[nextIndex];
    const nextSlotEndTimeMs = nextSlotStartTimeMs + nextItem.durationMs;
    
    if (!nextItem.isCommercialFill) {
      upcomingSlots.push({
        timeLabel: new Date(nextSlotStartTimeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        show: nextItem.show,
        episode: nextItem.episode,
        startTimeMs: nextSlotStartTimeMs,
        endTimeMs: nextSlotEndTimeMs,
        isCommercialFill: nextItem.isCommercialFill,
      });
    }
    nextSlotStartTimeMs = nextSlotEndTimeMs;
    offsetIndex++;
  }

  return {
    show: currentItem.show,
    episode: currentItem.episode,
    seekOffsetSeconds,
    remainingSeconds,
    currentSlot,
    upcomingSlots,
  };
}

export function getFutureScheduleForChannel(
  channel: Channel,
  daysAhead: number,
  options: { enableInterstitials?: boolean; targetGridMins?: number } = {}
): ScheduleSlot[] {
  const playlistItems = flattenChannelPlaylist(channel, options);
  const engine = new VirtualBroadcastEngine(channel, options.enableInterstitials ?? true);
  
  const now = new Date();
  const utcYear = now.getUTCFullYear();
  const utcMonth = now.getUTCMonth();
  const utcDate = now.getUTCDate() + daysAhead;

  const startOfDayMs = Date.UTC(utcYear, utcMonth, utcDate, 0, 0, 0, 0);
  const endOfDayMs = Date.UTC(utcYear, utcMonth, utcDate, 23, 59, 59, 999);

  const daySchedule: ScheduleSlot[] = [];
  let virtualTimeMs = startOfDayMs;

  while (virtualTimeMs <= endOfDayMs) {
    const liveState = engine.getLivePlaybackState(virtualTimeMs);
    const item = playlistItems[liveState.videoIndex] || playlistItems[0];
    
    const seekOffsetMs = liveState.seekToSeconds * 1000;
    const slotStartTimeMs = virtualTimeMs - seekOffsetMs;
    const slotEndTimeMs = slotStartTimeMs + item.durationMs;

    if (!item.isCommercialFill) {
      daySchedule.push({
        timeLabel: new Date(slotStartTimeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        show: item.show,
        episode: item.episode,
        startTimeMs: slotStartTimeMs,
        endTimeMs: slotEndTimeMs,
        isCommercialFill: item.isCommercialFill,
      });
    }

    virtualTimeMs = slotEndTimeMs;
  }

  return daySchedule;
}
