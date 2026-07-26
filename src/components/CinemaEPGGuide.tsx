/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { Channel, Episode, Show } from '../types';
import { Radio, Film, Play, Clock, ArrowRight, Layers, ChevronRight, Tv } from 'lucide-react';
import { flattenChannelPlaylist } from '../utils/scheduler';

interface CinemaEPGGuideProps {
  channel: Channel | null;
  selectedEpisode: Episode | null;
  isLiveMode: boolean;
  onSelectEpisode: (show: Show, episode: Episode, isLive: boolean) => void;
  isVisible: boolean;
  currentTimeMs: number;
}

export function CinemaEPGGuide({
  channel,
  selectedEpisode,
  isLiveMode,
  onSelectEpisode,
  isVisible,
  currentTimeMs,
}: CinemaEPGGuideProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to center the active "LIVE" slot when the menu is opened
  useEffect(() => {
    if (isVisible && scrollContainerRef.current) {
      setTimeout(() => {
        const liveElement = scrollContainerRef.current?.querySelector('.timeline-slot-card-live');
        if (liveElement) {
          liveElement.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center',
          });
        }
      }, 150);
    }
  }, [isVisible, channel?.id]);

  if (!channel) {
    return (
      <div
        id="floating-epg-guide"
        className={`floating-epg-guide flex items-center justify-center text-white/30 text-xs font-mono ${
          isVisible ? 'is-visible' : ''
        }`}
      >
        No Channel Selected
      </div>
    );
  }

  // Aggregate all playlist items (including commercial interstitials) across all shows in the channel
  const playlistItems = flattenChannelPlaylist(channel);

  // Calculate slots in a window around the current time
  let timelineSlots: Array<{
    show: Show;
    episode: Episode;
    startTimeMs: number;
    endTimeMs: number;
    timeLabel: string;
    isPast: boolean;
    isLive: boolean;
    isFuture: boolean;
  }> = [];

  if (playlistItems.length > 0) {
    const totalLoopDurationMs = playlistItems.reduce((acc, item) => acc + item.durationMs, 0);
    const positionInLoopMs = currentTimeMs % totalLoopDurationMs;

    let runningSumMs = 0;
    let currentSlotIndex = 0;
    for (let i = 0; i < playlistItems.length; i++) {
      const item = playlistItems[i];
      if (positionInLoopMs >= runningSumMs && positionInLoopMs < runningSumMs + item.durationMs) {
        currentSlotIndex = i;
        break;
      }
      runningSumMs += item.durationMs;
    }

    const seekOffsetMs = positionInLoopMs - runningSumMs;
    const currentSlotStartTime = currentTimeMs - seekOffsetMs;

    const windowIndices = [-1, 0, 1, 2, 3, 4, 5, 6];
    const slotsMap: Record<number, { startTimeMs: number; endTimeMs: number; item: typeof playlistItems[0] }> = {};

    const liveItem = playlistItems[currentSlotIndex];
    slotsMap[0] = {
      startTimeMs: currentSlotStartTime,
      endTimeMs: currentSlotStartTime + liveItem.durationMs,
      item: liveItem
    };

    let lastEndTime = slotsMap[0].endTimeMs;
    for (let i = 1; i <= 6; i++) {
      const idx = (currentSlotIndex + i) % playlistItems.length;
      const item = playlistItems[idx];
      slotsMap[i] = {
        startTimeMs: lastEndTime,
        endTimeMs: lastEndTime + item.durationMs,
        item
      };
      lastEndTime = slotsMap[i].endTimeMs;
    }

    const prevIdx = (currentSlotIndex - 1 + playlistItems.length) % playlistItems.length;
    const prevItem = playlistItems[prevIdx];
    slotsMap[-1] = {
      startTimeMs: currentSlotStartTime - prevItem.durationMs,
      endTimeMs: currentSlotStartTime,
      item: prevItem
    };

    windowIndices.forEach(i => {
      const slotData = slotsMap[i];
      const item = slotData.item;
      const slotStartTime = slotData.startTimeMs;
      const slotEndTime = slotData.endTimeMs;
      
      const startDate = new Date(slotStartTime);
      const timeLabel = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

      const isLive = currentTimeMs >= slotStartTime && currentTimeMs < slotEndTime;
      const isPast = currentTimeMs >= slotEndTime;
      const isFuture = currentTimeMs < slotStartTime;

      timelineSlots.push({
        show: item.show,
        episode: item.episode,
        startTimeMs: slotStartTime,
        endTimeMs: slotEndTime,
        timeLabel,
        isPast,
        isLive,
        isFuture,
      });
    });
  }

  return (
    <div
      id="floating-epg-guide"
      className={`floating-epg-guide flex flex-col p-4 text-white overflow-hidden relative ${
        isVisible ? 'is-visible' : ''
      }`}
    >
      {/* Ambient Channel Glow Backing Layer */}
      <div 
        className="absolute inset-0 pointer-events-none transition-all duration-700 opacity-20 filter blur-[24px] transform-gpu z-0"
        style={{
          background: `radial-gradient(circle at 50% 100%, ${channel.accentColor || '#8c5cd0'} 0%, transparent 70%)`
        }}
      />

      {/* Overlay Banner row */}
      <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div
            className="px-2 py-0.5 rounded text-[10px] font-black tracking-widest text-white font-mono select-none border border-white/10"
            style={{ backgroundColor: channel.accentColor || '#8c5cd0' }}
          >
            {channel.logoText || channel.number}
          </div>
          <div className="text-left">
            <h3 className="text-xs font-black text-white uppercase tracking-wider font-sans flex items-center gap-2">
              {channel.name}
              <span className="text-[10px] text-white/40 font-mono font-medium lowercase">
                (ch {channel.number})
              </span>
            </h3>
            <p className="text-[10px] text-white/40 font-sans truncate max-w-[280px]">
              {channel.tagline}
            </p>
          </div>
        </div>

        {/* Sync Mode HUD */}
        <div className="flex items-center gap-3">
          {isLiveMode ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-950/20 border border-red-500/20 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[9px] text-red-400 font-bold font-mono uppercase tracking-wider">
                VIRTUAL BROADCAST ACTIVE
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#8c5cd0]/10 border border-[#8c5cd0]/20 rounded-full">
              <Film className="w-3 h-3 text-[#8c5cd0]" />
              <span className="text-[9px] text-[#8c5cd0] font-bold font-mono uppercase tracking-wider">
                INTERACTIVE VOD MODE
              </span>
            </div>
          )}

          <div className="text-[10px] font-mono text-white/20 select-none hidden sm:inline">
            SCROLL TO EXPLORE ALL DAY
          </div>
        </div>
      </div>

      {/* Horizontal timeline */}
      <div
        ref={scrollContainerRef}
        className="timeline-horizontal-container flex-1 gap-3 pb-1 pr-1 scrollbar-none z-10"
      >
        {timelineSlots.length === 0 ? (
          <div className="flex items-center justify-center w-full text-xs font-mono text-white/20 py-8">
            No programmed showtimes found for this station.
          </div>
        ) : (
          timelineSlots.map((slot, index) => {
            const isPlayingThisEpisode =
              selectedEpisode && selectedEpisode.id === slot.episode.id;
            
            const isCurrentLiveAndInLiveMode = slot.isLive && isLiveMode;
            const isCurrentVodActive = isPlayingThisEpisode && !isLiveMode;

            // Compute Now Card Progress Fill Percentage (Phase 2, Bullet 2)
            const progressPercent = slot.isLive
              ? Math.max(
                  0,
                  Math.min(100, ((currentTimeMs - slot.startTimeMs) / (slot.endTimeMs - slot.startTimeMs)) * 100)
                )
              : 0;

            let cardBorder = 'border-white/5 bg-white/2';
            let cardHover = 'hover:border-white/15 hover:bg-white/5';
            
            if (slot.isLive) {
              cardBorder = 'border-[#8c5cd0]/40 bg-[#8c5cd0]/5 shadow-lg shadow-[#8c5cd0]/5';
              cardHover = 'hover:border-[#8c5cd0]/70 hover:bg-[#8c5cd0]/10';
            } else if (slot.isPast) {
              cardBorder = 'border-white/5 bg-black/40 opacity-45';
              cardHover = 'hover:opacity-75 hover:border-white/10';
            }

            if (isPlayingThisEpisode) {
              cardBorder = 'border-purple-400 bg-purple-950/20';
            }

            return (
              <button
                key={index}
                onClick={() => onSelectEpisode(slot.show, slot.episode, slot.isLive)}
                className={`timeline-slot-card w-72 p-3 rounded-xl border text-left flex flex-col justify-between cursor-pointer transition-all ${cardBorder} ${cardHover} ${
                  slot.isLive ? 'timeline-slot-card-live' : ''
                }`}
              >
                {/* Time & Badge Header */}
                <div className="flex items-center justify-between gap-2 mb-1.5 w-full">
                  <div className="flex items-center gap-1.5 font-mono text-[9px] font-bold text-white/50">
                    <Clock className="w-3 h-3 text-[#8c5cd0]" />
                    <span>{slot.timeLabel}</span>
                  </div>

                  {slot.isLive && (
                    <span className="flex items-center gap-1 text-[8px] font-mono font-black text-red-400 bg-red-950/50 border border-red-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">
                      <Radio className="w-2.5 h-2.5 text-red-400" />
                      LIVE NOW
                    </span>
                  )}
                  {slot.isPast && (
                    <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest">
                      Ended
                    </span>
                  )}
                  {slot.isFuture && (
                    <span className="text-[8px] font-mono text-purple-400 bg-purple-950/30 border border-purple-900/20 px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold">
                      Up Next
                    </span>
                  )}
                </div>

                {/* Show & Episode Details */}
                <div className="min-w-0 mb-2">
                  <h4 className="text-xs font-black text-white truncate font-sans">
                    {slot.show.title}
                  </h4>
                  <p className="text-[10px] text-white/40 truncate font-sans mt-0.5">
                    {slot.episode.title}
                  </p>
                </div>

                {/* Bottom metadata or Live progress bar */}
                <div className="w-full">
                  {slot.isLive ? (
                    <div className="space-y-1.5 w-full">
                      {/* Live progress indicators */}
                      <div className="flex items-center justify-between text-[8px] font-mono text-white/30">
                        <span>NOW</span>
                        <span>{Math.floor(progressPercent)}% SYNCED</span>
                      </div>
                      {/* Progress Bar Track */}
                      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden relative border border-white/5">
                        <div
                          className="h-full bg-gradient-to-r from-[#8c5cd0] to-purple-400 rounded-full shadow-[0_0_8px_rgba(140,92,208,0.5)] transition-all duration-1000 ease-linear"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-[8px] font-mono text-white/30">
                      <span>S{slot.episode.season || '01'} EP{slot.episode.episodeNumber || '01'}</span>
                      <span className="flex items-center gap-1 group-hover:text-purple-400 transition-colors">
                        VOD PLAYBACK
                        <ChevronRight className="w-2.5 h-2.5" />
                      </span>
                    </div>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
