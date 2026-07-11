/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Channel, Show, Episode } from '../types';
import { Calendar, Play, Radio, ChevronRight, ChevronLeft, Film } from 'lucide-react';
import { getLiveEpisodeForChannel } from '../utils/scheduler';

interface EPGGuideProps {
  channels: Channel[];
  selectedChannel: Channel;
  selectedEpisode: Episode;
  selectedShow: Show;
  isLiveMode: boolean;
  currentTimeMs: number;
  onSelectEpisode: (channel: Channel, show: Show, episode: Episode, isLive: boolean) => void;
  onLogEvent: (type: 'playing' | 'waiting' | 'stalled' | 'error' | 'epg' | 'custom', message: string) => void;
  isLoading?: boolean;
}

export function SkeletonLoading() {
  return (
    <div className="flex flex-col gap-3">
      {[1, 2, 3].map((idx) => (
        <div
          key={idx}
          className="border border-white/5 bg-black/40 rounded-lg overflow-hidden animate-pulse"
        >
          {/* Channel Header banner row Skeleton */}
          <div className="p-3 bg-[#111111]/80 border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Logo block skeleton */}
              <div className="w-12 h-7 bg-white/10 rounded" />
              <div className="text-left space-y-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-8 h-3 bg-white/10 rounded animate-pulse" />
                  <div className="w-24 h-3 bg-white/10 rounded animate-pulse" />
                </div>
                <div className="w-36 h-2.5 bg-white/5 rounded animate-pulse" />
              </div>
            </div>
            <div className="w-14 h-4 bg-white/5 border border-white/5 rounded" />
          </div>

          {/* EPG Timeline Slots & Show selectors Skeleton */}
          <div className="p-3 grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left 7 columns (LIVE TIMELINE SKELETON) */}
            <div className="lg:col-span-7 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono text-white/20 font-bold uppercase tracking-wider flex items-center gap-1">
                  <Radio className="w-2.5 h-2.5 text-red-500/40" />
                  Simulated Broadcast Time
                </span>
                <span className="text-[9px] text-[#8c5cd0]/40 font-mono font-semibold tracking-wider uppercase">
                  ACTIVE SYNC
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                {/* Active Live slot skeleton */}
                <div className="p-2.5 rounded border border-white/5 bg-[#111111]/40 flex items-center justify-between h-[50px]">
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] font-mono font-bold text-red-500/40 bg-red-950/20 border border-red-500/10 px-1.5 py-0.5 rounded uppercase tracking-wider select-none">
                      LIVE
                    </span>
                    <div className="text-left space-y-1">
                      <div className="w-48 h-3 bg-white/10 rounded" />
                      <div className="w-32 h-2.5 bg-white/5 rounded" />
                    </div>
                  </div>
                  <div className="w-3 h-3 bg-white/10 rounded-full animate-pulse" />
                </div>

                {/* Upcoming slot skeleton */}
                <div className="p-2 rounded bg-black/40 border border-white/5 flex items-center justify-between h-[34px]">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-4 bg-[#111111] rounded border border-white/5" />
                    <div className="w-40 h-3 bg-white/5 rounded" />
                  </div>
                  <span className="text-[9px] font-mono text-[#8c5cd0]/40 uppercase tracking-wider select-none">Up Next</span>
                </div>
              </div>
            </div>

            {/* Right 5 columns (VOD ARCHIVES SKELETON) */}
            <div className="lg:col-span-5 flex flex-col gap-2">
              <span className="text-[9px] font-mono text-white/20 font-bold uppercase tracking-wider flex items-center gap-1 select-none">
                <Film className="w-2.5 h-2.5 text-[#8c5cd0]/40" />
                Interactive Episodes (VOD)
              </span>

              <div className="flex flex-col gap-1 max-h-24 overflow-hidden">
                {[1, 2, 3].map((v) => (
                  <div
                    key={v}
                    className="px-2 py-1.5 rounded bg-black/40 border border-white/5 flex items-center justify-between h-[28px]"
                  >
                    <div className="w-32 h-2.5 bg-white/5 rounded animate-pulse" />
                    <div className="w-8 h-2 bg-white/5 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function EPGGuide({
  channels,
  selectedChannel,
  selectedEpisode,
  selectedShow,
  isLiveMode,
  currentTimeMs,
  onSelectEpisode,
  onLogEvent,
  isLoading = false,
}: EPGGuideProps) {
  const [activeCategory, setActiveCategory] = useState<'All' | 'TV Shows' | 'Movies' | 'Sports' | 'News' | 'Kids'>('All');
  const [isMoreChannelsExpanded, setIsMoreChannelsExpanded] = useState(false);
  const [isLocalLoading, setIsLocalLoading] = useState(true);

  // Loading state triggered when channel data is initialized or updated, showing skeleton for visual polish
  useEffect(() => {
    setIsLocalLoading(true);
    const timer = setTimeout(() => {
      setIsLocalLoading(false);
    }, 650); // Ensures a minimum of 500ms of loading for visual polish (set to 650ms)
    return () => clearTimeout(timer);
  }, [channels]);

  // List of categories matching channel-sort-item class requirements
  const categories: Array<'All' | 'TV Shows' | 'Movies' | 'Sports' | 'News' | 'Kids'> = [
    'All',
    'TV Shows',
    'Movies',
    'Sports',
    'News',
    'Kids',
  ];

  // Filter channels based on categories
  const filteredChannels = channels.filter(
    (ch) => activeCategory === 'All' || ch.category === activeCategory
  );

  // Split channels if "More Channels" is collapsed
  const channelsToShow = isMoreChannelsExpanded ? filteredChannels : filteredChannels.slice(0, 3);

  const handleCategorySelect = (category: typeof activeCategory) => {
    setIsLocalLoading(true);
    setActiveCategory(category);
    onLogEvent('epg', `[EPG Interaction]: Category selected: "${category}"`);
    
    // Simulate metadata/channel loading
    const timer = setTimeout(() => {
      setIsLocalLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  };

  const handleExpandToggle = () => {
    const nextState = !isMoreChannelsExpanded;
    setIsLocalLoading(true);
    setIsMoreChannelsExpanded(nextState);
    onLogEvent('epg', `[EPG Interaction]: More Channels toggled: ${nextState ? 'Expanded' : 'Collapsed'}`);
    
    // Simulate list loading
    const timer = setTimeout(() => {
      setIsLocalLoading(false);
    }, 450);
    return () => clearTimeout(timer);
  };

  const showSkeleton = isLoading || isLocalLoading;

  return (
    <div className="bg-[#0a0a0a] border border-white/10 rounded-lg p-5 text-white flex flex-col gap-6 shadow-2xl">
      {/* Category Sorter rail */}
      <div className="flex flex-col gap-3">
        <h4 className="text-[10px] font-mono font-bold tracking-[0.2em] text-[#8c5cd0] flex items-center gap-1.5 uppercase">
          <Calendar className="w-3.5 h-3.5" />
          Program Category Filter
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => {
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => handleCategorySelect(cat)}
                className={`channel-sort-item px-3 py-1 rounded-full text-[11px] font-medium cursor-pointer transition-all border ${
                  isActive
                    ? 'bg-[#8c5cd0] text-white border-[#8c5cd0]'
                    : 'bg-[#111111] text-white/40 border-white/5 hover:text-white hover:border-white/10'
                }`}
                id={`cat-${cat.toLowerCase().replace(' ', '-')}`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main EPG Grid */}
      <div className="flex flex-col gap-3">
        {showSkeleton ? (
          <SkeletonLoading />
        ) : channelsToShow.length === 0 ? (
          <div className="text-center py-8 bg-[#111111] rounded border border-white/5 text-white/30 text-xs font-mono">
            No virtual channels found under "{activeCategory}".
          </div>
        ) : (
          channelsToShow.map((ch) => {
            // Retrieve current Live Schedule Info for each channel
            const liveInfo = getLiveEpisodeForChannel(ch, currentTimeMs);
            const isCurrentlySelectedChannel = selectedChannel.id === ch.id;

            return (
              <div
                key={ch.id}
                className={`border rounded-lg overflow-hidden transition-all duration-300 ${
                  isCurrentlySelectedChannel
                    ? 'border-[#8c5cd0]/50 bg-[#111111]'
                    : 'border-white/5 bg-black/40 hover:border-white/10'
                }`}
              >
                {/* Channel Header banner row */}
                <div className="p-3 bg-[#111111]/80 border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {/* Retro TV logo text badge */}
                    <div
                      className="w-12 h-7 rounded flex items-center justify-center text-[10px] font-black tracking-widest text-white select-none font-mono"
                      style={{ backgroundColor: ch.accentColor }}
                    >
                      {ch.logoText}
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-white/30 font-bold">
                          CH {ch.number}
                        </span>
                        <h3 className="text-xs font-bold text-white tracking-tight">
                          {ch.name}
                        </h3>
                      </div>
                      <p className="text-[10px] text-white/40 font-sans">{ch.tagline}</p>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded bg-white/5 text-[9px] text-white/50 border border-white/5 font-mono uppercase tracking-wider">
                    {ch.category}
                  </span>
                </div>

                {/* EPG Timeline Slots & Show selectors */}
                <div className="p-3 grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* LIVE TIMELINE (Left 7 Cols) */}
                  <div className="lg:col-span-7 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono text-white/30 font-bold uppercase tracking-wider flex items-center gap-1">
                        <Radio className="w-2.5 h-2.5 text-red-500 animate-pulse" />
                        Simulated Broadcast Time
                      </span>
                      <span className="text-[9px] text-[#8c5cd0] font-mono font-semibold tracking-wider uppercase">
                        ACTIVE SYNC
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      {/* Active Slot row */}
                      <button
                        onClick={() => onSelectEpisode(ch, liveInfo.show, liveInfo.episode, true)}
                        className={`p-2.5 rounded text-left flex items-center justify-between transition-all group/slot border cursor-pointer ${
                          isCurrentlySelectedChannel && isLiveMode
                            ? 'bg-[#8c5cd0]/10 border-[#8c5cd0]/30 text-white'
                            : 'bg-[#111111]/40 border-white/5 text-white/70 hover:bg-[#111111] hover:text-white'
                        }`}
                        id={`live-slot-${ch.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono font-bold text-red-500 bg-red-950/40 border border-red-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider">
                            LIVE
                          </span>
                          <div className="text-left">
                            <p className="text-xs font-bold">
                              {liveInfo.show.title}: {liveInfo.episode.title}
                            </p>
                            <p className="text-[9px] text-white/40 font-mono mt-0.5">
                              S{liveInfo.episode.season || '01'} EP{liveInfo.episode.episodeNumber || '01'} • Scheduling Block
                            </p>
                          </div>
                        </div>
                        <Play className="w-3 h-3 fill-current opacity-40 group-hover/slot:opacity-100 transition-opacity text-[#8c5cd0]" />
                      </button>

                      {/* Next slot listing */}
                      {liveInfo.upcomingSlots.slice(0, 1).map((slot, index) => (
                        <div
                          key={index}
                          className="p-2 rounded bg-black/40 border border-white/5 text-white/50 flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-mono text-white/30 bg-[#111111] px-1.5 py-0.5 rounded border border-white/5">
                              {slot.timeLabel}
                            </span>
                            <span className="font-medium text-white/60 text-xs">
                              {slot.show.title}: {slot.episode.title}
                            </span>
                          </div>
                          <span className="text-[9px] font-mono text-[#8c5cd0] uppercase tracking-wider">Up Next</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ON DEMAND MENU / ARCHIVES (Right 5 Cols) */}
                  <div className="lg:col-span-5 flex flex-col gap-2">
                    <span className="text-[9px] font-mono text-white/30 font-bold uppercase tracking-wider flex items-center gap-1 select-none">
                      <Film className="w-2.5 h-2.5 text-[#8c5cd0]" />
                      Interactive Episodes (VOD)
                    </span>

                    <div className="flex flex-col gap-1 overflow-y-auto max-h-24 pr-1 scrollbar-thin scrollbar-thumb-white/10">
                      {ch.shows.flatMap((show) =>
                        show.episodes.map((ep) => {
                          const isCurrentlyPlayingThisVOD =
                            isCurrentlySelectedChannel &&
                            !isLiveMode &&
                            selectedEpisode.id === ep.id;

                          return (
                            <button
                              key={ep.id}
                              onClick={() => onSelectEpisode(ch, show, ep, false)}
                              className={`px-2 py-1 rounded text-left text-xs font-sans transition-all cursor-pointer flex items-center justify-between group/vod border ${
                                isCurrentlyPlayingThisVOD
                                  ? 'bg-[#8c5cd0]/10 text-[#8c5cd0] border-[#8c5cd0]/20 font-bold'
                                  : 'hover:bg-white/5 text-white/50 hover:text-white border-transparent'
                              }`}
                              id={`vod-ep-${ep.id}`}
                            >
                              <span className="truncate max-w-[160px]">
                                {show.title} • {ep.title}
                              </span>
                              <span className="text-[9px] font-mono text-white/20 group-hover/vod:text-white/40 shrink-0">
                                S{ep.season || '1'}E{ep.episodeNumber || '1'}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* More Channels Footer element with specific non-interactive label design mandate */}
      <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
        <span className="text-white/30 text-[9px] font-mono select-none uppercase tracking-wider">
          EPG NETWORK FEED v2.4.1
        </span>

        {/* More Channels navigation group */}
        <div className="flex items-center gap-3">
          {/* Label is NON-INTERACTIVE (cursor-default) as mandated */}
          <span className="text-white/40 font-medium select-none cursor-default text-[10px] uppercase tracking-wider font-mono" id="lbl-more-channels">
            More Channels
          </span>

          {/* Adjacent SVG container holds cursor-pointer action */}
          <div
            onClick={handleExpandToggle}
            className="inline-flex items-center justify-center p-1 bg-[#111111] hover:bg-white/5 border border-white/5 text-white/55 hover:text-white rounded-full transition-all cursor-pointer select-none active:scale-90"
            title={isMoreChannelsExpanded ? 'Collapse channels view' : 'Display all network channels'}
            id="btn-more-channels-trigger"
          >
            {isMoreChannelsExpanded ? (
              <ChevronLeft className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
