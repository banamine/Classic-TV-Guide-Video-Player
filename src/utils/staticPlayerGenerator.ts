/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Channel } from '../types';

/**
 * Generates a fully self-contained HTML + JS file that includes an embedded
 * channel playlist, an HLS.js video player, and a real-time auto-scheduler loop.
 * This can be hosted anywhere (e.g. GitHub Pages) and run directly in the browser!
 * Rewritten as a modern, premium, Cinema-First viewing experience.
 */
export function generateStaticPlayerHtml(channels: Channel[], playlistName: string = "M3U Pro Auto-Scheduled Playlist", epgSavePath: string = "epg.json"): string {
  const channelsJson = JSON.stringify(channels, null, 2);
  const safeChannels = channelsJson
    .replace(/</g, '\\u003c')
    .replace(/<\/script>/gi, '<\\/script>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${playlistName} - Cinema Live Player</title>
  
  <!-- Preconnect and Preload to increase network priority and avoid render delays -->
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  
  <!-- Preload Hls.js script for high-priority loading -->
  <link rel="preload" href="https://cdn.jsdelivr.net/npm/hls.js@1.4.0/dist/hls.min.js" as="script">
  
  <!-- Tailwind CSS CDN (Deferred to prevent render-blocking HTML parser) -->
  <script src="https://cdn.tailwindcss.com" defer></script>
  
  <!-- Load HLS.js from CDN synchronously to guarantee it is available before player scripts run -->
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.4.0/dist/hls.min.js"></script>
  
  <!-- Synchronous local fallback if CDN fails to load -->
  <script>
    if (typeof Hls === 'undefined') {
      console.warn('CDN hls.js failed. Synchronously falling back to local hls.min.js...');
      var fallback = document.createElement('script');
      fallback.src = 'hls.min.js';
      fallback.async = false;
      document.head.appendChild(fallback);
    }
  </script>
  
  <!-- Google Fonts: Inter & JetBrains Mono with Swap support -->
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">

  <style>
    body {
      font-family: 'Inter', sans-serif;
      background-color: #050508;
      color: #f3f4f6;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      height: 100vh;
      width: 100vw;
      overflow: hidden;
      position: relative;
    }
    .font-mono {
      font-family: 'JetBrains Mono', monospace;
    }
    /* Static CSS overrides for instant, non-blocking render of the splash/loading state without FOUC */
    #player-splash {
      position: absolute;
      inset: 0;
      background-color: rgba(7, 7, 10, 0.95);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      z-index: 25;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      text-align: center;
      transition: all 0.5s ease;
    }
    #player-splash .splash-box {
      text-align: center;
      position: relative;
      z-index: 20;
      padding: 2rem 1.5rem;
      border-radius: 1rem;
      max-width: 28rem;
      background-color: #111116;
      border: 1px solid rgba(255, 255, 255, 0.05);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    #btn-start-play {
      margin-top: 1.5rem;
      padding: 0.625rem 1.5rem;
      background-color: #9333ea;
      color: #ffffff;
      font-size: 0.75rem;
      font-weight: 900;
      border-radius: 9999px;
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      border: 1px solid rgba(168, 85, 247, 0.2);
      box-shadow: 0 10px 15px -3px rgba(147, 51, 234, 0.3);
      transition: all 0.2s ease;
    }
    #btn-start-play:hover {
      background-color: #a855f7;
    }
    /* Hide scrollbar utility */
    .scrollbar-none::-webkit-scrollbar {
      display: none;
    }
    .scrollbar-none {
      -ms-overflow-style: none;
      scrollbar-width: none;
    }
    /* Custom scrollbar */
    ::-webkit-scrollbar {
      width: 4px;
      height: 4px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 9999px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.2);
    }
  </style>
</head>
<body class="bg-[#050508] text-gray-100 flex flex-col h-screen w-screen overflow-hidden relative select-none">

  <!-- Ambient Glow Backing Layer -->
  <div id="ambient-backdrop-glow" class="absolute inset-0 pointer-events-none transition-all duration-1000 opacity-20 filter blur-[28px] transform-gpu z-0"></div>

  <!-- MAIN VIDEO CANVAS WRAPPER -->
  <div id="video-canvas-container" class="absolute inset-0 w-full h-full bg-black overflow-hidden flex flex-col justify-between z-[1]">
    
    <!-- HTML5 Video Element -->
    <video id="video-element" class="absolute inset-0 w-full h-full object-contain cursor-pointer transition-all duration-500" playsinline controls></video>

    <!-- Tap to Unmute Floating Banner (z-30) -->
    <div id="unmute-banner" class="fixed top-20 left-1/2 -translate-x-1/2 z-30 bg-purple-600/90 hover:bg-purple-500 backdrop-blur-md text-white text-[10px] font-black tracking-widest px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 border border-purple-400/20 cursor-pointer opacity-0 transition-all duration-500 scale-95 uppercase" style="pointer-events: none;">
      <svg class="w-3.5 h-3.5 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
      </svg>
      <span>MUTED BROADCAST • TAP TO UNMUTE</span>
    </div>

    <!-- Subtle Centered Buffering Spinner Overlay (z-[12]) -->
    <div id="buffer-spinner" class="absolute inset-0 z-[12] flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] opacity-0 pointer-events-none transition-opacity duration-300">
      <div class="flex flex-col items-center gap-3 p-4 bg-black/80 border border-white/10 rounded-2xl shadow-2xl">
        <div class="relative w-10 h-10">
          <!-- Outer Track -->
          <div class="absolute inset-0 rounded-full border-2 border-white/5"></div>
          <!-- Spinning Arc -->
          <div id="buffer-ring" class="absolute inset-0 rounded-full border-2 border-t-purple-500 border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>
        </div>
        <div class="text-center">
          <p id="buffer-title" class="text-[10px] font-mono font-black text-white uppercase tracking-widest animate-pulse">Buffering Stream</p>
          <p id="buffer-desc" class="text-[9px] font-mono text-white/40 mt-0.5 uppercase tracking-wider">Awaiting Stream Packets...</p>
        </div>
      </div>
    </div>

    <!-- Edge-to-Edge Initial Setup / Branding Splash Screen (z-[25]) -->
    <div id="player-splash" class="absolute inset-0 bg-[#07070a]/95 backdrop-blur-md z-[25] flex flex-col items-center justify-center p-6 text-center transition-all duration-500">
      <div class="absolute inset-0 bg-gradient-to-tr from-purple-950/10 via-transparent to-transparent pointer-events-none opacity-40"></div>
      
      <div class="splash-box text-center relative z-20 px-6 py-8 rounded-2xl max-w-md bg-[#111116] border border-white/5 shadow-2xl">
        <div class="inline-flex items-center justify-center p-3.5 bg-black border border-purple-500/20 rounded-full mb-4 animate-bounce">
          <svg class="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z"></path>
          </svg>
        </div>
        <h2 id="splash-channel-name" class="text-lg font-black tracking-tight text-white uppercase font-sans">CINEMA CHANNELS</h2>
        <p id="splash-status-text" class="text-[10px] text-purple-400 font-mono tracking-widest mt-1 uppercase">Broadcast engine waiting</p>
        
        <button id="btn-start-play" class="mt-6 px-6 py-2.5 bg-purple-600 text-white text-xs font-black rounded-full hover:bg-purple-500 shadow-lg pointer-events-auto transition-transform active:scale-95 uppercase tracking-widest border border-purple-400/20">
          Start Stream Loop
        </button>
      </div>

      <div class="absolute bottom-6 left-6 text-left">
        <div class="text-white/20 font-mono text-[9px] uppercase tracking-widest">NEXUS CINEMA CORE</div>
        <div class="text-white/40 text-xs font-sans">Readying virtual scheduled broadcasts...</div>
      </div>
    </div>

    <!-- Quick-instructions bottom-left hotkeys guide -->
    <div id="corner-keys" class="fixed bottom-4 left-6 z-40 text-left opacity-100 transition-opacity duration-300 select-none pointer-events-none">
      <p class="text-[10px] font-mono text-white/40 leading-normal uppercase tracking-wider">
        [M] Left Menu • [G] Bottom Guide • [A] Toggle Ratio
      </p>
    </div>

    <!-- TOP HUD OVERLAY CONTROLS BAR (z-40) -->
    <div id="top-hud" class="fixed top-4 right-4 z-40 flex items-center gap-3 transition-all duration-300">
      
      <!-- HUD Status Pill -->
      <div class="flex items-center gap-2 px-3.5 py-2 bg-black/60 backdrop-blur-md rounded-full border border-white/10 text-[10px] font-mono shadow-xl">
        <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
        <span class="text-white/50">STATION:</span>
        <strong id="hud-channel-name" class="text-white tracking-wide uppercase">OFFLINE</strong>
      </div>

      <!-- Aspect Ratio Button -->
      <button id="hud-ratio-btn" class="px-3.5 py-2 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white border border-white/10 text-[10px] font-mono rounded-full flex items-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer" title="Toggle Aspect Ratio: Cover (Full Screen) vs Contain (Letterbox)">
        <span class="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
        <span>RATIO: CONTAIN</span>
      </button>

      <!-- Station Directory Drawer Toggle Button -->
      <button id="hud-menu-btn" class="px-4 py-2 bg-[#121217] hover:bg-[#1a1a24] backdrop-blur-md text-white border border-white/10 text-[10px] font-black tracking-widest rounded-full flex items-center gap-2 shadow-lg active:scale-95 transition-all cursor-pointer">
        <svg class="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 6h16M4 12h16M4 18h16"></path></svg>
        <span>CHANNELS</span>
      </button>

      <!-- EPG TV Guide Toggle Button -->
      <button id="hud-guide-btn" class="px-4 py-2 bg-[#121217] hover:bg-[#1a1a24] backdrop-blur-md text-white border border-white/10 text-[10px] font-black tracking-widest rounded-full flex items-center gap-2 shadow-lg active:scale-95 transition-all cursor-pointer">
        <svg class="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
        <span>TV GUIDE</span>
      </button>
    </div>

  </div>

  <!-- SLIDING LEFT STATION DRAWER (z-[45]) -->
  <aside id="left-drawer" class="fixed top-0 bottom-0 left-0 w-80 bg-[#07070a]/95 border-r border-white/10 backdrop-blur-md transform -translate-x-full transition-transform duration-500 z-[45] flex flex-col overflow-hidden text-left shadow-2xl">
    
    <!-- Ambient channel glow backing -->
    <div id="drawer-glow" class="absolute inset-0 pointer-events-none transition-all duration-700 opacity-20 filter blur-[24px] transform-gpu z-0"></div>

    <!-- Header -->
    <div class="p-4 border-b border-white/10 bg-black/40 z-10">
      <div class="flex items-center gap-2 text-purple-400 mb-1">
        <svg class="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4"></path></svg>
        <h2 class="text-xs font-black tracking-widest text-white uppercase font-sans">STATION DIRECTORY</h2>
      </div>
      <p class="text-[9px] font-mono text-gray-500 uppercase tracking-widest">Select station tuner</p>
    </div>

    <!-- Search box -->
    <div class="p-3 border-b border-white/5 bg-black/20 z-10">
      <div class="relative">
        <input id="drawer-search" type="text" placeholder="Search playlist..." class="w-full bg-[#111115] border border-white/10 focus:border-purple-500/50 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-gray-500 outline-none transition-all">
      </div>
    </div>

    <!-- Categories ribbon row -->
    <div id="drawer-categories" class="flex gap-1.5 overflow-x-auto p-3 border-b border-white/5 scrollbar-none bg-black/20 shrink-0 z-10">
      <!-- Dyn Loaded Categories Buttons -->
    </div>

    <!-- Channel list -->
    <div id="drawer-channel-list" class="flex-1 overflow-y-auto p-2 space-y-1 z-10">
      <!-- Dyn Loaded Channel Buttons -->
    </div>
  </aside>

  <!-- SLIDING BOTTOM TV GUIDE OVERLAY (z-[45]) -->
  <aside id="bottom-guide" class="fixed bottom-0 left-0 right-0 h-72 bg-[#07070a]/95 border-t border-white/10 backdrop-blur-md transform translate-y-full transition-transform duration-500 z-[45] flex flex-col p-4 text-white overflow-hidden shadow-2xl text-left">
    
    <!-- Ambient channel glow backing -->
    <div id="guide-glow" class="absolute inset-0 pointer-events-none transition-all duration-700 opacity-20 filter blur-[24px] transform-gpu z-0"></div>

    <!-- Header Row -->
    <div class="flex items-center justify-between border-b border-white/5 pb-2 mb-3 shrink-0 z-10">
      <div class="flex items-center gap-3">
        <div id="guide-badge" class="px-2 py-0.5 rounded text-[10px] font-black tracking-widest text-white font-mono border border-white/10" style="background-color: rgb(140, 92, 208);">WSTN</div>
        <div class="text-left">
          <h2 id="guide-channel-name" class="text-xs font-black tracking-wider uppercase text-white font-sans">No Channel</h2>
          <p id="guide-channel-tagline" class="text-[9px] font-mono text-purple-400">EPG Live Scheduler</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <span class="px-2.5 py-0.5 text-[9px] bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-full font-mono uppercase tracking-widest">
          TV Shows
        </span>
      </div>
    </div>

    <!-- Main current show details bar -->
    <div class="bg-black/40 border border-white/5 rounded-lg p-3 mb-3 flex items-center justify-between z-10 shrink-0">
      <div class="flex items-center gap-3">
        <div class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
        <div>
          <span class="text-[9px] font-mono text-gray-500 uppercase tracking-wider block">EPG Live Block:</span>
          <h3 id="guide-current-show-title" class="text-xs font-bold text-white uppercase tracking-wider">Loading...</h3>
          <p id="guide-current-show-episode" class="text-[10px] text-gray-400">Loading schedule...</p>
        </div>
      </div>
      <div class="text-right">
        <span id="guide-clock" class="text-xs font-mono font-bold text-purple-400 bg-purple-950/20 px-3 py-1.5 rounded border border-purple-500/10">00:00:00 AM</span>
      </div>
    </div>

    <!-- Timeline header -->
    <div class="text-[9px] font-mono text-gray-500 uppercase tracking-widest mb-1.5 z-10 shrink-0">
      Auto-Scheduled Virtual Loop Schedule
    </div>

    <!-- Horizontal timeline slots container -->
    <div id="guide-slots" class="flex-1 flex gap-3 pb-1 pr-1 overflow-x-auto z-10 scrollbar-none">
      <!-- Dyn Loaded Slots -->
    </div>
  </aside>

  <!-- DATA & LOGIC INTERACTIVE ENGINE -->
  <script>
    // 1. EMBEDDED CHANNELS DATA (M3U PRO GENERATED)
    const CHANNELS = ${safeChannels} || [];

    if (CHANNELS.length === 0) {
      console.error("Broadcast Engine: No channel data available.");
      const hudEl = document.getElementById('hud-channel-name');
      if (hudEl) hudEl.innerText = "DATA ERROR";
    }

    let activeChannel = null;
    let currentHlsInstance = null;
    let currentlyPlayingEpisodeId = null;
    let hasInteracted = false;
    let selectedCategory = 'All';
    let searchQuery = '';
    let videoFit = 'contain'; // cover vs contain
    
    // Drawers states
    let isLeftDrawerOpen = false;
    let isBottomGuideOpen = false;

    function showUnmuteOverlay(visible) {
      const banner = document.getElementById('unmute-banner');
      if (!banner) return;
      if (visible) {
        banner.style.opacity = '1';
        banner.style.pointerEvents = 'auto';
        banner.style.transform = 'translate(-50%, 0) scale(1)';
      } else {
        banner.style.opacity = '0';
        banner.style.pointerEvents = 'none';
        banner.style.transform = 'translate(-50%, 0) scale(0.95)';
      }
    }

    function unmuteVideo() {
      const video = document.getElementById('video-element');
      if (!video) return;
      video.muted = false;
      showUnmuteOverlay(false);
    }

    // 2. TIMELINE LOOP SCHEDULER
    function getLiveEpisodeForChannel(channel, timestampMs) {
      const playlistItems = [];
      if (channel.shows && channel.shows.length > 0) {
        channel.shows.forEach(show => {
          if (show.episodes && show.episodes.length > 0) {
            show.episodes.forEach(episode => {
              playlistItems.push({ show, episode, durationMs: (episode.runtimeMins || 30) * 60 * 1000 });
            });
          }
        });
      }

      if (playlistItems.length === 0) {
        const fallbackShow = {
          id: 'vod-' + channel.id,
          title: channel.name + ' Direct Stream',
          description: channel.tagline || 'Live streaming feed loop.',
          year: new Date().getFullYear().toString(),
          genre: channel.category || 'General',
          episodes: [{ id: 'ep-' + channel.id, title: 'Live Broadcast', url: channel.url, runtimeMins: 30 }]
        };
        playlistItems.push({ show: fallbackShow, episode: fallbackShow.episodes[0], durationMs: 30 * 60 * 1000 });
      }

      const totalLoopDurationMs = playlistItems.reduce((acc, item) => acc + item.durationMs, 0);

      // Find where we are in the endless loop
      const positionInLoopMs = timestampMs % totalLoopDurationMs;
      
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

      const currentItem = playlistItems[currentSlotIndex];
      const seekOffsetMs = positionInLoopMs - runningSumMs;
      const seekOffsetSeconds = seekOffsetMs / 1000;
      const remainingSeconds = (currentItem.durationMs - seekOffsetMs) / 1000;

      const currentSlotStartTimeMs = timestampMs - seekOffsetMs;
      const currentSlotEndTimeMs = currentSlotStartTimeMs + currentItem.durationMs;

      const currentSlot = {
        timeLabel: new Date(currentSlotStartTimeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        show: currentItem.show,
        episode: currentItem.episode,
        startTimeMs: currentSlotStartTimeMs,
        endTimeMs: currentSlotEndTimeMs,
      };

      // Generate upcoming schedule slots
      const upcomingSlots = [];
      let nextSlotStartTimeMs = currentSlotEndTimeMs;
      for (let i = 1; i <= 6; i++) {
        const nextIndex = (currentSlotIndex + i) % playlistItems.length;
        const nextItem = playlistItems[nextIndex];
        const nextSlotEndTimeMs = nextSlotStartTimeMs + nextItem.durationMs;
        upcomingSlots.push({
          timeLabel: new Date(nextSlotStartTimeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          show: nextItem.show,
          episode: nextItem.episode,
          startTimeMs: nextSlotStartTimeMs,
          endTimeMs: nextSlotEndTimeMs,
        });
        nextSlotStartTimeMs = nextSlotEndTimeMs;
      }

      return {
        show: currentItem.show,
        episode: currentItem.episode,
        seekOffsetSeconds,
        remainingSeconds,
        currentSlot,
        upcomingSlots
      };
    }

    // 3. MAIN WORKSPACE ENGINE
    function updateClock() {
      const clockString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const clockEl = document.getElementById('guide-clock');
      if (clockEl) {
        clockEl.innerText = clockString;
      }
    }

    // Render Categories buttons in Sidebar Drawer
    function renderCategories() {
      const ribbon = document.getElementById('drawer-categories');
      ribbon.innerHTML = '';

      const distinctCategories = ['All', ...new Set(CHANNELS.map(c => c.category || 'General'))];
      
      distinctCategories.forEach(cat => {
        const btn = document.createElement('button');
        const isActive = selectedCategory === cat;
        btn.className = \`px-2.5 py-1 text-[9px] font-mono font-black uppercase tracking-widest rounded-full transition-all shrink-0 cursor-pointer border \${
          isActive
            ? 'bg-[#8c5cd0] border-[#8c5cd0] text-white shadow-md'
            : 'bg-[#111116] border-white/5 text-gray-400 hover:bg-[#1a1a24] hover:text-white'
        }\`;
        btn.innerText = cat;
        btn.onclick = () => {
          selectedCategory = cat;
          renderCategories();
          renderChannels();
        };
        ribbon.appendChild(btn);
      });
    }

    // Render Station Buttons in Sidebar Drawer
    function renderChannels() {
      const container = document.getElementById('drawer-channel-list');
      container.innerHTML = '';

      const filtered = CHANNELS.filter(ch => {
        const matchCat = selectedCategory === 'All' || ch.category === selectedCategory;
        const channelNumStr = (ch.number !== undefined && ch.number !== null) ? ch.number.toString() : '';
        const matchSearch = !searchQuery || 
          ch.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
          channelNumStr.includes(searchQuery) ||
          (ch.category && ch.category.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchCat && matchSearch;
      });

      if (filtered.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-white/30 text-[10px] font-mono uppercase tracking-widest">No stations found</div>';
        return;
      }

      filtered.forEach(ch => {
        const btn = document.createElement('button');
        const isActive = activeChannel && activeChannel.id === ch.id;
        
        btn.className = \`w-full text-left p-2.5 rounded-lg border transition-all flex items-center gap-3 cursor-pointer group focus:outline-none \${
          isActive
            ? 'bg-[#8c5cd0]/20 border-[#8c5cd0]/60 shadow-lg shadow-purple-500/5'
            : 'border-white/5 bg-[#12131b]/30 hover:bg-[#1a1c29]/50 hover:border-white/10'
        }\`;
        btn.onclick = () => {
          selectChannel(ch);
        };

        const badge = document.createElement('div');
        badge.className = 'w-10 h-6 rounded flex items-center justify-center text-[9px] font-black tracking-widest text-white font-mono shrink-0 select-none';
        badge.style.backgroundColor = ch.accentColor || '#8c5cd0';
        badge.innerText = ch.logoText || 'LIVE';

        const textCont = document.createElement('div');
        textCont.className = 'overflow-hidden text-left flex-1';
        
        const numberSpan = document.createElement('span');
        numberSpan.className = \`text-[9px] font-mono block \${isActive ? 'text-purple-400 font-bold' : 'text-purple-400/60'}\`;
        const displayNum = (ch.number !== undefined && ch.number !== null) ? ch.number : (CHANNELS.indexOf(ch) + 1);
        numberSpan.innerText = 'CH ' + displayNum;

        const nameSpan = document.createElement('span');
        nameSpan.className = \`text-xs font-bold truncate block \${isActive ? 'text-white' : 'text-gray-300 group-hover:text-white'}\`;
        nameSpan.innerText = ch.name;

        textCont.appendChild(numberSpan);
        textCont.appendChild(nameSpan);
        btn.appendChild(badge);
        btn.appendChild(textCont);
        container.appendChild(btn);
      });
    }

    function selectChannel(channel) {
      activeChannel = channel;
      
      // Update glow backdrops
      const color = channel.accentColor || '#8c5cd0';
      document.getElementById('ambient-backdrop-glow').style.background = \`radial-gradient(circle at 50% 50%, \${color} 0%, transparent 70%)\`;
      document.getElementById('drawer-glow').style.background = \`radial-gradient(circle at 50% 50%, \${color} 0%, transparent 75%)\`;
      document.getElementById('guide-glow').style.background = \`radial-gradient(circle at 50% 100%, \${color} 0%, transparent 75%)\`;

      // Update splash fields
      document.getElementById('splash-channel-name').innerText = channel.name;
      document.getElementById('splash-status-text').innerText = "Tuned & Scheduled";

      // HUD channels list
      document.getElementById('hud-channel-name').innerText = channel.name;

      // Bottom guide metadata
      document.getElementById('guide-channel-name').innerText = channel.name;
      document.getElementById('guide-channel-tagline').innerText = channel.category ? 'Genre: ' + channel.category : 'IPTV Auto-Scheduled';
      
      const guideBadge = document.getElementById('guide-badge');
      guideBadge.style.backgroundColor = color;
      guideBadge.innerText = channel.logoText || 'LIVE';

      updateEPGAndSchedule();
      renderChannels();

      // Show beautiful branding layer loader while buffering/autoplay resolves
      if (!hasInteracted) {
        const splash = document.getElementById('player-splash');
        if (splash) {
          splash.style.display = 'flex';
          splash.style.zIndex = '25';
          splash.style.opacity = '1';
          splash.style.pointerEvents = 'auto';
        }
      } else {
        const splash = document.getElementById('player-splash');
        if (splash) {
          splash.style.opacity = '0';
          splash.style.pointerEvents = 'none';
          setTimeout(() => {
            splash.style.zIndex = '-1';
            splash.style.display = 'none';
          }, 500);
        }
      }

      startActiveStream();
    }

    function updateEPGAndSchedule() {
      if (!activeChannel) return;

      const now = Date.now();
      const liveInfo = getLiveEpisodeForChannel(activeChannel, now);

      // Render current show fields
      document.getElementById('guide-current-show-title').innerText = liveInfo.show.title;
      document.getElementById('guide-current-show-episode').innerText = 'S' + (liveInfo.episode.season || '01') + ' EP' + (liveInfo.episode.episodeNumber || '01') + ' • ' + liveInfo.episode.title;

      // Render slots list inside TV Guide slideout
      const slotsContainer = document.getElementById('guide-slots');
      slotsContainer.innerHTML = '';

      // Include current slot as active
      const activeSlot = liveInfo.currentSlot;
      const actDiv = document.createElement('div');
      actDiv.className = 'flex-1 min-w-[220px] max-w-[280px] p-3 rounded-lg border border-purple-500/40 bg-purple-950/20 flex flex-col justify-between shrink-0';
      actDiv.innerHTML = \`
        <div>
          <div class="flex items-center justify-between gap-1.5 mb-1.5">
            <span class="text-[9px] font-mono text-purple-300 font-bold tracking-widest">\${activeSlot.timeLabel}</span>
            <span class="px-1.5 py-0.5 rounded bg-red-600 text-[8px] font-black text-white font-mono tracking-widest animate-pulse">LIVE NOW</span>
          </div>
          <h4 class="text-xs font-black text-white uppercase tracking-wider truncate">\${activeSlot.show.title}</h4>
          <p class="text-[10px] text-white/60 truncate mt-0.5">\${activeSlot.episode.title}</p>
        </div>
        <div class="text-[8px] font-mono text-purple-400/80 uppercase tracking-widest mt-2">Active broadcast segment</div>
      \`;
      slotsContainer.appendChild(actDiv);

      // Remaining upcoming slots
      liveInfo.upcomingSlots.forEach(slot => {
        const slotDiv = document.createElement('div');
        slotDiv.className = 'flex-1 min-w-[220px] max-w-[280px] p-3 rounded-lg border border-white/5 bg-[#111116]/40 hover:bg-[#1a1a24]/50 hover:border-white/10 flex flex-col justify-between shrink-0 transition-colors';
        slotDiv.innerHTML = \`
          <div>
            <div class="flex items-center justify-between gap-1.5 mb-1.5">
              <span class="text-[9px] font-mono text-purple-400/70 font-bold tracking-widest">\${slot.timeLabel}</span>
              <span class="text-[8px] font-mono text-gray-500 tracking-widest uppercase">UPCOMING</span>
            </div>
            <h4 class="text-xs font-bold text-gray-200 truncate uppercase tracking-wide">\${slot.show.title}</h4>
            <p class="text-[10px] text-gray-400 truncate mt-0.5">\${slot.episode.title}</p>
          </div>
          <div class="text-[8px] font-mono text-gray-500 uppercase tracking-widest mt-2">Scheduled Segment</div>
        \`;
        slotsContainer.appendChild(slotDiv);
      });
    }

    function startActiveStream() {
      if (!activeChannel) return;

      const video = document.getElementById('video-element');
      const splash = document.getElementById('player-splash');
      
      const now = Date.now();
      const liveInfo = getLiveEpisodeForChannel(activeChannel, now);
      currentlyPlayingEpisodeId = liveInfo.episode ? liveInfo.episode.id : null;
      let streamUrl = liveInfo.episode.url || activeChannel.url || '';

      // Ensure the URL is properly formatted/encoded (e.g. spaces converted to %20)
      if (streamUrl && !streamUrl.includes('%') && streamUrl.includes(' ')) {
        streamUrl = encodeURI(streamUrl);
      }

      if (!streamUrl) {
        document.getElementById('splash-status-text').innerText = "STREAM PATH NOT COMPATIBLE";
        return;
      }

      const isHls = streamUrl.includes('.m3u8') || streamUrl.includes('m3u8');
      
      if (isHls && typeof Hls === 'undefined') {
        console.warn("HLS decoder engine not loaded yet. Waiting 500ms before starting stream...");
        const splashText = document.getElementById('splash-status-text');
        if (splashText) splashText.innerText = "AWAITING DECODER ENGINE...";
        setTimeout(startActiveStream, 500);
        return;
      }

      // Clean up previous HLS instances
      if (currentHlsInstance) {
        currentHlsInstance.destroy();
        currentHlsInstance = null;
      }

      video.onloadedmetadata = null;
      video.onplaying = null;
      video.onwaiting = null;
      video.onstalled = null;
      video.onerror = null;
      video.onvolumechange = null;
      video.onended = null;

      // Handle loading overlay status state
      setSpinnerVisible(true);

      // Listen to volume changes so native unmuting syncs perfectly
      video.onvolumechange = function() {
        if (!video.muted && video.volume > 0) {
          showUnmuteOverlay(false);
        }
      };

      let isSeekingOrLoading = false;

      video.onloadedmetadata = function() {
        video.onloadedmetadata = null;
        const duration = video.duration;
        let seekSeconds = liveInfo.seekOffsetSeconds;
        if (duration && duration > 0 && duration !== Infinity && !isNaN(duration)) {
          seekSeconds = liveInfo.seekOffsetSeconds % duration;
          seekSeconds = Math.min(seekSeconds, Math.max(0, duration - 0.5));
        }
        if (!isNaN(seekSeconds) && seekSeconds > 0) {
          try {
            video.currentTime = seekSeconds;
          } catch (e) {
            console.warn("Setting currentTime on loadedmetadata threw:", e);
          }
        }
      };

      // Set up responsive state listeners
      video.onplaying = function() {
        isSeekingOrLoading = false;
        setSpinnerVisible(false);
        // Seamlessly fade out the splash loading layer once media packets actually begin rendering
        splash.style.opacity = '0';
        splash.style.pointerEvents = 'none';
        setTimeout(() => {
          splash.style.zIndex = '-1';
          splash.style.display = 'none';
        }, 500);
      };
      
      video.onwaiting = function() {
        setSpinnerVisible(true);
      };
      
      video.onstalled = function() {
        setSpinnerVisible(true);
      };

      video.onerror = function() {
        isSeekingOrLoading = false;
        console.error("Video element encountered a playback/load error for stream:", streamUrl);
        setSpinnerVisible(true, "RECONNECTING STREAM...", "Re-establishing connection to stream buffer...", false);
        // Retry connection after 2.5s backoff buffer pause instead of instantly skipping/failing
        setTimeout(() => {
          if (activeChannel) {
            startActiveStream();
          }
        }, 2500);
      };

      video.onended = function() {
        console.log("[Playback Engine] Episode ended naturally. Reloading active schedule segment.");
        startActiveStream();
      };

      function attemptAutoplay() {
        video.play()
          .then(function() {
            hasInteracted = true;
            showUnmuteOverlay(false);
          })
          .catch(function(e) {
            console.log("Autoplay policy blocked unmuted audio, trying muted fallback...", e);
            video.muted = true;
            showUnmuteOverlay(true);
            video.play()
              .then(function() {
                hasInteracted = true;
              })
              .catch(function(e2) {
                console.error("Muted autoplay also blocked: ", e2);
              });
          });
      }

      if (isHls && typeof Hls !== 'undefined' && Hls.isSupported()) {
        const hls = new Hls({
          maxMaxBufferLength: 10,
          enableWorker: false
        });
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        currentHlsInstance = hls;

        hls.on(Hls.Events.MANIFEST_PARSED, function() {
          attemptAutoplay();
        });

        hls.on(Hls.Events.ERROR, function(event, data) {
          if (data.fatal) {
            console.warn("Fatal HLS error encountered:", data);
            switch(data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                if (data.details === 'manifestLoadError' || data.details === 'manifestLoadTimeOut') {
                  showStreamOfflineUI("STATION OFFLINE", "COULD NOT CONNECT TO STREAM OR GATEWAY RETURNED ERROR.");
                } else {
                  hls.startLoad();
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                showStreamOfflineUI("STREAM ERROR", "DECODER PIPELINE ENCOUNTERED A FATAL EXCEPTION.");
                break;
            }
          }
        });
      } else {
        video.src = streamUrl;
        video.load();
        attemptAutoplay();
      }
    }

    function setSpinnerVisible(visible, title, desc, isError) {
      const spinner = document.getElementById('buffer-spinner');
      if (!spinner) return;
      if (visible) {
        spinner.style.opacity = '1';
        spinner.style.pointerEvents = 'auto';
        
        const titleEl = document.getElementById('buffer-title');
        const descEl = document.getElementById('buffer-desc');
        const ringEl = document.getElementById('buffer-ring');
        
        if (titleEl) {
          titleEl.innerText = title || 'Buffering Stream';
          if (isError) {
            titleEl.classList.remove('animate-pulse');
          } else {
            titleEl.classList.add('animate-pulse');
          }
        }
        if (descEl) {
          descEl.innerText = desc || 'Awaiting Stream Packets...';
        }
        
        if (ringEl) {
          if (isError) {
            ringEl.style.borderColor = '#ef4444';
            ringEl.classList.remove('animate-spin');
          } else {
            ringEl.style.borderColor = 'transparent';
            ringEl.style.borderTopColor = '#a855f7';
            ringEl.classList.add('animate-spin');
          }
        }
      } else {
        spinner.style.opacity = '0';
        spinner.style.pointerEvents = 'none';
      }
    }

    function showStreamOfflineUI(title, desc) {
      setSpinnerVisible(true, title || 'STATION OFFLINE', desc || 'The stream could not be reached. Try switching stations.', true);
      const hudEl = document.getElementById('hud-channel-name');
      if (hudEl) {
        hudEl.innerText = "OFFLINE";
      }
    }

    // Interactive toggles
    function toggleLeftDrawer() {
      const drawer = document.getElementById('left-drawer');
      const keys = document.getElementById('corner-keys');
      isLeftDrawerOpen = !isLeftDrawerOpen;
      
      if (isLeftDrawerOpen) {
        drawer.style.transform = 'translateX(0)';
        keys.style.opacity = '0';
      } else {
        drawer.style.transform = 'translateX(-100%)';
        keys.style.opacity = '1';
      }
    }

    // Explicitly handle mouse hover behavior on left drawer for auto-hide
    const drawerEl = document.getElementById('left-drawer');
    drawerEl.onmouseleave = function() {
      if (isLeftDrawerOpen) {
        toggleLeftDrawer();
      }
    };

    function toggleBottomGuide() {
      const guide = document.getElementById('bottom-guide');
      const keys = document.getElementById('corner-keys');
      isBottomGuideOpen = !isBottomGuideOpen;

      if (isBottomGuideOpen) {
        guide.style.transform = 'translateY(0)';
        keys.style.opacity = '0';
      } else {
        guide.style.transform = 'translateY(100%)';
        keys.style.opacity = '1';
      }
    }

    // Explicitly handle mouse hover behavior on bottom guide for auto-hide
    const guideEl = document.getElementById('bottom-guide');
    guideEl.onmouseleave = function() {
      if (isBottomGuideOpen) {
        toggleBottomGuide();
      }
    };

    function toggleAspectRatio() {
      const video = document.getElementById('video-element');
      const btn = document.getElementById('hud-ratio-btn');
      
      if (videoFit === 'cover') {
        videoFit = 'contain';
        video.style.objectFit = 'contain';
        btn.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-purple-500"></span><span>RATIO: CONTAIN</span>';
      } else {
        videoFit = 'cover';
        video.style.objectFit = 'cover';
        btn.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-purple-500"></span><span>RATIO: COVER</span>';
      }
    }

    // Bind interaction buttons
    document.getElementById('btn-start-play').onclick = function() {
      hasInteracted = true;
      const splash = document.getElementById('player-splash');
      if (splash) {
        splash.style.opacity = '0';
        splash.style.pointerEvents = 'none';
        setTimeout(() => {
          splash.style.zIndex = '-1';
          splash.style.display = 'none';
        }, 500);
      }
      unmuteVideo();
      startActiveStream();
    };

    document.getElementById('hud-ratio-btn').onclick = toggleAspectRatio;
    document.getElementById('hud-menu-btn').onclick = toggleLeftDrawer;
    document.getElementById('hud-guide-btn').onclick = toggleBottomGuide;

    // Search filter typing listener
    document.getElementById('drawer-search').oninput = function(e) {
      searchQuery = e.target.value;
      renderChannels();
    };

    // Video play/pause on click
    const video = document.getElementById('video-element');
    video.onclick = function() {
      if (video.muted) {
        unmuteVideo();
        return;
      }
      if (!hasInteracted) return;
      if (video.paused) {
        video.play().catch(e => console.log(e));
      } else {
        video.pause();
      }
    };

    // Unmute banner click action
    document.getElementById('unmute-banner').onclick = function(e) {
      e.stopPropagation();
      unmuteVideo();
    };

    // Hotkeys binding
    document.addEventListener('keydown', function(e) {
      const key = e.key.toLowerCase();
      if (document.activeElement && document.activeElement.tagName === 'INPUT') {
        return;
      }
      if (key === 'm') {
        e.preventDefault();
        toggleLeftDrawer();
      } else if (key === 'g') {
        e.preventDefault();
        toggleBottomGuide();
      } else if (key === 'a') {
        e.preventDefault();
        toggleAspectRatio();
      }
    });

    // Browser Tab Sleep Throttling Safeguard
    // Re-syncs player to wall-clock time instantly when tab regains focus
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        console.log('[Time Engine] Tab regained visibility. Re-synchronizing to absolute wall-clock (Date.now())...');
        if (activeChannel) {
          updateEPGAndSchedule();
          startActiveStream();
        }
      }
    });

    // Stuck Detection loop
    let lastTime = video.currentTime;
    let lastChecked = Date.now();
    let consecutiveStuckCount = 0;

    setInterval(() => {
      if (video && !video.paused && !video.ended && video.readyState >= 1) {
        const now = Date.now();
        const curTime = video.currentTime;

        if (curTime === lastTime) {
          const durationSinceLastAdvance = now - lastChecked;
          if (durationSinceLastAdvance >= 1000) {
            consecutiveStuckCount++;
            console.warn("Stuck nudging " + curTime.toFixed(3) + "s (Attempt #" + consecutiveStuckCount + ")");
            video.currentTime = Math.min(video.duration || Infinity, curTime + 0.1);
            lastChecked = Date.now();
          }
        } else {
          lastTime = curTime;
          lastChecked = now;
          consecutiveStuckCount = 0;
        }
      } else if (video) {
        lastTime = video.currentTime;
        lastChecked = Date.now();
      }
    }, 250);

    // Bootstrap loading
    window.epgFileExists = false;

    async function initPlayer() {
      updateClock();
      setInterval(updateClock, 1000);
      
      // Slice array to create a distinct copy so mutation of CHANNELS won't empty the default list
      let loadedChannels = CHANNELS.slice();
      try {
        const epgPath = '${epgSavePath}';
        var fetchUrl = epgPath;
        if (window.location.protocol === 'blob:') {
          fetchUrl = window.location.origin + '/' + epgPath;
        }
        
        // Skip fetch on local file:// protocol to avoid browser SecurityExceptions / CORS blocks
        if (window.location.protocol !== 'file:') {
          const response = await fetch(fetchUrl);
          if (response.ok) {
            window.epgFileExists = true;
            const remoteChannels = await response.json();
            if (Array.isArray(remoteChannels) && remoteChannels.length > 0) {
              loadedChannels = remoteChannels;
              console.log("Successfully synchronized dynamic EPG state from " + epgPath, remoteChannels.length + " channels");
            }
          } else {
            console.warn("Dynamic EPG state file " + epgPath + " not found. Falling back to embedded channels.");
          }
        } else {
          console.log("Running from local file:// environment. Bypassing dynamic EPG fetch and using embedded channels directly.");
        }
      } catch (err) {
        console.warn("Could not load dynamic EPG state file, falling back to embedded channels:", err);
      }

      // Load fresh news segments if available
      try {
        if (window.location.protocol !== 'file:') {
          let newsData = null;
          const newsPaths = ['fresh_news.json', 'news.json', '/fresh_news.json', '/news.json'];
          for (const np of newsPaths) {
            try {
              const res = await fetch(np);
              if (res.ok) {
                newsData = await res.json();
                console.log("Loaded fresh news from " + np, newsData);
                break;
              }
            } catch (e) {}
          }

          if (newsData && Array.isArray(newsData.episodes)) {
            // Group episodes by groupTitle
            const groupedShows = {};
            newsData.episodes.forEach(ep => {
              const showTitle = ep.groupTitle || ep.tvgName || 'Special News';
              const showId = showTitle.toLowerCase().replace(/[^a-z0-9]/g, '-');
              if (!groupedShows[showId]) {
                groupedShows[showId] = {
                  id: showId,
                  title: showTitle,
                  description: ep.description || 'Recent news broadcast segment.',
                  year: '2026',
                  genre: 'News',
                  episodes: []
                };
              }
              groupedShows[showId].episodes.push({
                id: ep.id,
                title: ep.title,
                season: String(ep.season || 1),
                episodeNumber: String(ep.episode || 1),
                url: ep.url,
                subtitleUrl: ep.subtitleUrl,
                funFact: ep.description || 'Live news coverage.'
              });
            });

            // Map each grouped show to a dedicated Channel or merge them into existing News channels (e.g., ch-cnn, ch-fox)
            Object.values(groupedShows).forEach(showObj => {
              const showTitleUpper = showObj.title.toUpperCase();
              let targetChannelId = '';
              if (showTitleUpper.includes('CNN')) {
                targetChannelId = 'ch-cnn';
              } else if (showTitleUpper.includes('FOX') || showTitleUpper.includes('THE STORY WITH MARTHA')) {
                targetChannelId = 'ch-fox';
              } else if (showTitleUpper.includes('BAY AREA') || showTitleUpper.includes('KPIX') || showTitleUpper.includes('CBS')) {
                targetChannelId = 'ch-cnn';
              } else if (
                showTitleUpper.includes('DEUTSCHE WELLE') || 
                showTitleUpper.includes('DW NEWS') || 
                showTitleUpper.startsWith('DW ') ||
                showTitleUpper.startsWith('DW_') ||
                showTitleUpper === 'DW'
              ) {
                targetChannelId = 'ch-dw';
              } else if (showTitleUpper.includes('BBC')) {
                targetChannelId = 'ch-bbc';
              } else if (
                showTitleUpper.startsWith('RT ') || 
                showTitleUpper.startsWith('RT_') || 
                showTitleUpper === 'RT' || 
                showTitleUpper.includes('RUSSIA TODAY') || 
                showTitleUpper.includes('SANCHEZ EFFECT') || 
                showTitleUpper.includes('CROSSTALK')
              ) {
                targetChannelId = 'ch-rt';
              }

              if (targetChannelId) {
                let existingChan = loadedChannels.find(ch => ch.id === targetChannelId);
                if (existingChan) {
                  existingChan.shows = [showObj];
                } else {
                  loadedChannels.push({
                    id: targetChannelId,
                    name: showObj.title,
                    logoText: 'NEWS',
                    accentColor: '#dc2626',
                    category: 'News',
                    url: showObj.episodes[0]?.url || '',
                    shows: [showObj]
                  });
                }
              } else {
                loadedChannels.push({
                  id: 'ch-' + showObj.id,
                  name: showObj.title,
                  logoText: 'NEWS',
                  accentColor: '#3b82f6',
                  category: 'News',
                  url: showObj.episodes[0]?.url || '',
                  shows: [showObj]
                });
              }
            });
          }
        }
      } catch (newsErr) {
        console.warn("Could not fetch fresh news segments:", newsErr);
      }

      // Update CHANNELS array
      CHANNELS.length = 0;
      loadedChannels.forEach(function(c) {
        CHANNELS.push(c);
      });
      
      renderCategories();
      renderChannels();
      
      if (CHANNELS.length > 0) {
        selectChannel(CHANNELS[0]);
      } else {
        console.error("No channels available to tune.");
      }

      // Synchronize schedule, layout, and rollover states every 5 seconds
      setInterval(() => {
        updateEPGAndSchedule();
        if (activeChannel) {
          const now = Date.now();
          const liveInfo = getLiveEpisodeForChannel(activeChannel, now);
          if (liveInfo && liveInfo.episode && liveInfo.episode.id !== currentlyPlayingEpisodeId) {
            console.log("[EPG Engine] Scheduled segment rolled over. Reloading stream.");
            startActiveStream();
          }
        }
      }, 5000);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      initPlayer();
    } else {
      window.addEventListener('DOMContentLoaded', initPlayer);
    }
  </script>
</body>
</html>`;
}
