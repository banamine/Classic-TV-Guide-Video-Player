/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Channel, Episode, Show } from '../types';

export interface ScheduleSlot {
  timeLabel: string; // e.g. "06:00 PM"
  show: Show;
  episode: Episode;
  startTimeMs: number;
  endTimeMs: number;
}

/**
 * Calculates what episode is "Live" right now on a given channel,
 * and what time offset we should seek to.
 */
export function getLiveEpisodeForChannel(channel: Channel, timestampMs: number): {
  show: Show;
  episode: Episode;
  seekOffsetSeconds: number;
  remainingSeconds: number;
  currentSlot: ScheduleSlot;
  upcomingSlots: ScheduleSlot[];
} {
  // Aggregate all episodes across all shows in the channel to form a continuous loop
  const playlistItems: Array<{ show: Show; episode: Episode }> = [];
  channel.shows.forEach((show) => {
    show.episodes.forEach((episode) => {
      playlistItems.push({ show, episode });
    });
  });

  if (playlistItems.length === 0) {
    throw new Error(`Channel ${channel.name} has no episodes!`);
  }

  // Treat each episode as a fixed 30-minute (1800 seconds) slot in a continuous loop
  const SLOT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
  const totalLoopDurationMs = playlistItems.length * SLOT_DURATION_MS;

  // Find where we are in the endless loop
  const positionInLoopMs = timestampMs % totalLoopDurationMs;
  const currentSlotIndex = Math.floor(positionInLoopMs / SLOT_DURATION_MS);
  const seekOffsetMs = positionInLoopMs % SLOT_DURATION_MS;

  const currentItem = playlistItems[currentSlotIndex];
  const seekOffsetSeconds = seekOffsetMs / 1000;
  const remainingSeconds = (SLOT_DURATION_MS - seekOffsetMs) / 1000;

  // Let's generate slots starting from the current hour/half-hour boundary
  const currentHourBoundary = timestampMs - (timestampMs % SLOT_DURATION_MS);

  const makeSlot = (indexInPlaylist: number, boundaryMs: number): ScheduleSlot => {
    const item = playlistItems[indexInPlaylist % playlistItems.length];
    const date = new Date(boundaryMs);
    const timeLabel = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return {
      timeLabel,
      show: item.show,
      episode: item.episode,
      startTimeMs: boundaryMs,
      endTimeMs: boundaryMs + SLOT_DURATION_MS,
    };
  };

  const currentSlot = makeSlot(currentSlotIndex, currentHourBoundary);

  // Generate 4 upcoming slots
  const upcomingSlots: ScheduleSlot[] = [];
  for (let i = 1; i <= 4; i++) {
    const nextBoundary = currentHourBoundary + i * SLOT_DURATION_MS;
    upcomingSlots.push(makeSlot(currentSlotIndex + i, nextBoundary));
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
