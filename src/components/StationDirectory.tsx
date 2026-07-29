/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Channel } from '../types';
import { Radio, Search, Tv, Film, Play, ChevronRight, Hash, Sparkles, Edit3 } from 'lucide-react';
import { getLiveEpisodeForChannel } from '../utils/scheduler';

interface StationDirectoryProps {
  channels: Channel[];
  selectedChannel: Channel | null;
  onSelectChannel: (channel: Channel) => void;
  onEditChannel?: (channel: Channel) => void;
  isOpen: boolean;
  currentTimeMs: number;
}

export function StationDirectory({
  channels,
  selectedChannel,
  onSelectChannel,
  onEditChannel,
  isOpen,
  currentTimeMs,
}: StationDirectoryProps) {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Extract all categories dynamically
  const categories = ['All', ...Array.from(new Set(channels.map((ch) => ch.category || 'Uncategorized'))).sort()];

  // Filter channels by search query and category
  const filteredChannels = channels.filter((ch) => {
    const matchesCategory = activeCategory === 'All' || ch.category === activeCategory;
    const matchesSearch =
      ch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ch.number.includes(searchQuery) ||
      (ch.category && ch.category.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <aside
      id="station-directory-drawer"
      className={`station-directory-drawer flex flex-col h-full overflow-hidden relative ${
        isOpen ? 'is-open' : ''
      }`}
    >
      {/* Ambient Channel Glow Backing Layer */}
      {selectedChannel && (
        <div 
          className="absolute inset-0 pointer-events-none transition-all duration-700 opacity-20 filter blur-[24px] transform-gpu z-0"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${selectedChannel.accentColor || '#8c5cd0'} 0%, transparent 70%)`
          }}
        />
      )}

      {/* Drawer Header */}
      <div className="p-4 border-b border-white/10 bg-black/40 z-10">
        <div className="flex items-center gap-2 text-purple-400 mb-2">
          <Tv className="w-5 h-5 text-[#8c5cd0]" />
          <h2 className="text-sm font-black tracking-widest text-white uppercase font-sans">
            STATION DIRECTORY
          </h2>
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse ml-auto" />
        </div>
        <p className="text-[10px] text-white/40 font-mono uppercase tracking-wider mb-3">
          {channels.length} Broadcasters Online
        </p>

        {/* Search Box */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-white/40" />
          <input
            type="text"
            placeholder="Search channels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-md py-1.5 pl-8 pr-3 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#8c5cd0]/50 font-sans"
          />
        </div>
      </div>

      {/* Category Ribbon */}
      <div className="flex gap-1.5 overflow-x-auto p-3 border-b border-white/5 scrollbar-none bg-black/20 shrink-0 z-10">
        {categories.map((cat) => {
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap border transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#8c5cd0] text-white border-[#8c5cd0]'
                  : 'bg-white/5 text-white/50 border-transparent hover:text-white hover:border-white/10'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-white/10 z-10">
        {filteredChannels.length === 0 ? (
          <div className="text-center py-8 text-white/30 text-[11px] font-mono">
            No stations found
          </div>
        ) : (
          filteredChannels.map((ch) => {
            const isSelected = selectedChannel && selectedChannel.id === ch.id;
            
            // Get current Live show information for this station
            let liveShowTitle = 'On Air';
            let liveEpisodeTitle = 'Live Stream';
            try {
              if (ch.shows && ch.shows.length > 0) {
                const liveInfo = getLiveEpisodeForChannel(ch, currentTimeMs);
                liveShowTitle = liveInfo.show.title;
                liveEpisodeTitle = liveInfo.episode.title;
              }
            } catch (e) {
              // Fallback
            }

            return (
              <button
                key={ch.id}
                onClick={() => onSelectChannel(ch)}
                className={`w-full p-2.5 rounded-lg text-left flex items-center justify-between border transition-all group cursor-pointer ${
                  isSelected
                    ? 'bg-[#8c5cd0]/15 border-[#8c5cd0]/45 shadow-lg shadow-[#8c5cd0]/5'
                    : 'bg-white/0 hover:bg-white/5 border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 overflow-hidden min-w-0 flex-1">
                  {/* Channel retro icon */}
                  <div
                    className="w-10 h-7 rounded flex items-center justify-center text-[9px] font-black tracking-widest text-white font-mono select-none shrink-0 border border-white/10"
                    style={{ backgroundColor: ch.accentColor || '#333' }}
                  >
                    {ch.logoText || ch.number}
                  </div>

                  <div className="text-left min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-mono font-semibold text-white/30 shrink-0">
                        CH {ch.number}
                      </span>
                      <h4 className="text-xs font-bold text-white truncate leading-snug">
                        {ch.name}
                      </h4>
                    </div>
                    {/* Live indicator & Program */}
                    <div className="flex items-center gap-1 text-[9px] text-[#c5c6c7]/60 truncate font-sans mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 inline-block animate-pulse" />
                      <span className="font-mono text-[8px] text-red-400 font-bold uppercase tracking-tight shrink-0 mr-1">
                        LIVE
                      </span>
                      <span className="truncate">{liveShowTitle}</span>
                    </div>
                  </div>
                </div>

                <div className="pl-2 flex items-center gap-1 shrink-0">
                  {onEditChannel && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditChannel(ch);
                      }}
                      className="p-1 text-white/30 hover:text-purple-300 hover:bg-purple-900/40 rounded transition-colors"
                      title="Edit station titles & stream URL"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-white/20 group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all" />
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Drawer Footer */}
      <div className="p-3 bg-black/40 border-t border-white/10 text-center flex items-center justify-center gap-2">
        <Sparkles className="w-3 h-3 text-[#8c5cd0] animate-pulse" />
        <span className="text-[8px] font-mono text-white/30 uppercase tracking-widest">
          CINEMA CORE v2.4.1
        </span>
      </div>
    </aside>
  );
}
