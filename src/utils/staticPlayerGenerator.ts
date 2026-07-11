/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Channel } from '../types';

/**
 * Generates a fully self-contained HTML + JS file that includes an embedded
 * channel playlist, an HLS.js video player, and a real-time auto-scheduler loop.
 * This can be hosted anywhere (e.g. GitHub Pages) and run directly in the browser!
 */
export function generateStaticPlayerHtml(channels: Channel[], playlistName: string = "M3U Pro Auto-Scheduled Playlist"): string {
  const channelsJson = JSON.stringify(channels, null, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${playlistName} - Static Broadcast Player</title>
  
  <!-- Tailwind CSS for high fidelity presentation -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <!-- HLS.js CDN for HLS streaming support (.m3u8 streams) -->
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
  
  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">

  <style>
    body {
      font-family: 'Inter', sans-serif;
    }
    .font-mono {
      font-family: 'JetBrains Mono', monospace;
    }
    /* Custom dark scrollbar */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: #0d0e12;
    }
    ::-webkit-scrollbar-thumb {
      background: #1f2029;
      border-radius: 3px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #2d2e3d;
    }
  </style>
</head>
<body class="bg-[#08090c] text-gray-100 flex flex-col h-screen overflow-hidden">

  <!-- TOP HEADER NAV BAR -->
  <header class="bg-[#0f111a] border-b border-purple-950/40 px-6 py-4 flex items-center justify-between shrink-0">
    <div class="flex items-center gap-3">
      <div class="p-2 bg-purple-900/40 border border-purple-500/30 rounded-lg text-purple-400">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z"></path></svg>
      </div>
      <div>
        <h1 class="text-sm font-black uppercase tracking-wider text-white">NEXUS PRO STATION PLAYER</h1>
        <p class="text-[10px] text-purple-400/80 font-mono uppercase tracking-widest mt-0.5">Auto-Scheduled Virtual Loop</p>
      </div>
    </div>
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
        <div class="w-2 h-2 rounded-full bg-red-500 animate-ping"></div>
        <span class="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Live Engine Active</span>
      </div>
      <div id="system-clock" class="text-xs font-mono text-purple-400 font-bold tracking-wider">00:00:00 AM</div>
    </div>
  </header>

  <!-- MAIN WORKSPACE -->
  <main class="flex-1 flex overflow-hidden w-full">
    
    <!-- LEFT SIDEBAR: CHANNELS LIST -->
    <aside class="w-80 bg-[#0c0d12] border-r border-purple-950/20 flex flex-col h-full overflow-hidden">
      <div class="p-4 border-b border-white/5 shrink-0">
        <h2 class="text-[10px] font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
          STATION DIRECTORY (<span id="channel-count">0</span>)
        </h2>
      </div>
      <div id="channel-list" class="flex-1 overflow-y-auto p-2.5 space-y-1.5">
        <!-- Dyn Loaded Channels go here -->
      </div>
    </aside>

    <!-- RIGHT GRID: ACTIVE PLAYER & SCHEDULE -->
    <div class="flex-1 flex flex-col lg:flex-row overflow-hidden bg-[#07080a]">
      
      <!-- CENTER: PLAYER STAGE -->
      <div class="flex-1 flex flex-col p-6 overflow-y-auto space-y-6">
        <div class="relative aspect-video w-full max-w-4xl mx-auto bg-black rounded-2xl border border-white/10 overflow-hidden shadow-2xl flex flex-col justify-between group">
          <!-- HTML5 Video Player -->
          <video id="video-element" class="absolute inset-0 w-full h-full object-contain" playsinline controls></video>
          
          <!-- Loading / Idle / Error Splash Overlay -->
          <div id="player-splash" class="absolute inset-0 bg-[#0d0d12]/95 backdrop-blur-sm z-15 flex flex-col items-center justify-center p-6 text-center select-none pointer-events-none transition-opacity duration-500">
            <div class="absolute inset-0 bg-radial from-purple-950/20 via-transparent to-transparent pointer-events-none opacity-40"></div>
            <div class="p-4 bg-black border border-purple-500/20 rounded-full mb-3 animate-bounce">
              <svg class="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
            <h3 id="splash-channel-name" class="text-base font-black text-white uppercase tracking-wider">SELECT STATION</h3>
            <p id="splash-status-text" class="text-[10px] text-purple-400 font-mono tracking-widest mt-1 uppercase">Broadcast engine waiting</p>
            
            <button id="btn-start-play" class="mt-4 px-6 py-2 bg-purple-700 text-white text-xs font-bold rounded-full hover:bg-purple-600 shadow-lg pointer-events-auto transition-transform active:scale-95 uppercase tracking-wider">
              Start Stream Loop
            </button>
          </div>
          
          <!-- Info overlay banner -->
          <div class="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/85 to-transparent flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 bg-red-600 text-white text-[9px] font-bold rounded animate-pulse">LIVE</span>
              <div class="text-left">
                <h4 id="overlay-show-title" class="text-xs font-bold text-white">Direct Stream Feed</h4>
                <p id="overlay-episode-title" class="text-[10px] text-white/70">Broadcasting Now</p>
              </div>
            </div>
          </div>
        </div>

        <!-- TUNER DETAILS CARD -->
        <div class="bg-[#0f111a] border border-white/5 rounded-xl p-5 max-w-4xl mx-auto w-full text-left space-y-4 shadow-xl">
          <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/5">
            <div class="flex items-center gap-3">
              <div id="detail-channel-logo" class="w-12 h-7 bg-purple-900 rounded flex items-center justify-center text-[10px] font-black text-white font-mono">
                LIVE
              </div>
              <div>
                <h3 id="detail-channel-name" class="text-sm font-black text-white uppercase">No Channel Selected</h3>
                <p id="detail-channel-tag" class="text-xs text-gray-400 mt-0.5">Please select a channel from the sidebar.</p>
              </div>
            </div>
            <span id="detail-channel-group" class="px-3 py-1 bg-white/5 border border-white/5 text-[9px] text-purple-400 rounded-full font-mono font-bold uppercase tracking-widest">
              N/A
            </span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div class="space-y-1">
              <span class="text-[9px] font-mono text-gray-500 uppercase tracking-widest">Current Stream URL:</span>
              <div id="detail-stream-url" class="text-xs font-mono text-gray-400 select-all truncate bg-black/40 p-2 rounded border border-white/5">
                None
              </div>
            </div>
            <div class="space-y-1">
              <span class="text-[9px] font-mono text-gray-500 uppercase tracking-widest">Virtual EPG Progress:</span>
              <div id="detail-epg-status" class="text-xs font-sans text-purple-400 font-bold bg-purple-950/10 p-2 rounded border border-purple-500/10 flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Syncing loop timeline
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT SIDEBAR: PROGRAM EPG GUIDE -->
      <aside class="w-full lg:w-80 bg-[#0a0b0f] border-t lg:border-t-0 lg:border-l border-purple-950/20 flex flex-col h-full overflow-hidden">
        <div class="p-4 border-b border-white/5 shrink-0 text-left">
          <h2 class="text-[10px] font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2">
            <svg class="w-3.5 h-3.5 text-purple-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
            AUTO-SCHEDULED TIMELINE
          </h2>
        </div>
        <div class="p-4 bg-black/40 border-b border-white/5 space-y-1 text-left shrink-0">
          <span class="text-[9px] font-mono text-gray-500 uppercase tracking-wider block">EPG Live Block:</span>
          <div id="live-epg-title" class="text-xs font-bold text-white truncate">Direct Stream Mode</div>
          <div id="live-epg-meta" class="text-[10px] font-mono text-purple-400">Looping continuous feeds</div>
        </div>
        <div id="epg-slots" class="flex-1 overflow-y-auto p-3 space-y-2 text-left">
          <!-- Upcoming slots loaded here -->
        </div>
      </aside>

    </div>
  </main>

  <!-- DATA & LOGIC BLOCK -->
  <script>
    // 1. EMBEDDED CHANNELS DATA (M3U PRO GENERATED)
    const CHANNELS = ${channelsJson};

    let activeChannel = null;
    let currentHlsInstance = null;
    let hasInteracted = false;

    // 2. TIMELINE LOOP SCHEDULER
    function getLiveEpisodeForChannel(channel, timestampMs) {
      // Aggregate all episodes across all shows in the channel to form a continuous loop
      const playlistItems = [];
      if (channel.shows && channel.shows.length > 0) {
        channel.shows.forEach(show => {
          if (show.episodes && show.episodes.length > 0) {
            show.episodes.forEach(episode => {
              playlistItems.push({ show, episode });
            });
          }
        });
      }

      if (playlistItems.length === 0) {
        // Fallback if no shows / episodes structured, create mock VOD stream
        const fallbackShow = {
          id: 'vod-' + channel.id,
          title: channel.name + ' Direct Stream',
          description: channel.tagline || 'Live streaming feed loop.',
          year: new Date().getFullYear().toString(),
          genre: channel.category || 'General',
          episodes: [{ id: 'ep-' + channel.id, title: 'Live Broadcast', url: channel.url }]
        };
        playlistItems.push({ show: fallbackShow, episode: fallbackShow.episodes[0] });
      }

      const SLOT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
      const totalLoopDurationMs = playlistItems.length * SLOT_DURATION_MS;

      // Find where we are in the endless loop
      const positionInLoopMs = timestampMs % totalLoopDurationMs;
      const currentSlotIndex = Math.floor(positionInLoopMs / SLOT_DURATION_MS);
      const seekOffsetMs = positionInLoopMs % SLOT_DURATION_MS;

      const currentItem = playlistItems[currentSlotIndex];
      const seekOffsetSeconds = seekOffsetMs / 1000;
      const remainingSeconds = (SLOT_DURATION_MS - seekOffsetMs) / 1000;

      // Make Slot times
      const currentHourBoundary = timestampMs - (timestampMs % SLOT_DURATION_MS);
      
      const makeSlot = (indexInPlaylist, boundaryMs) => {
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
      const upcomingSlots = [];
      for (let i = 1; i <= 4; i++) {
        upcomingSlots.push(makeSlot(currentSlotIndex + i, currentHourBoundary + i * SLOT_DURATION_MS));
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
      const clockEl = document.getElementById('system-clock');
      if (clockEl) {
        clockEl.innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
    }

    function renderChannels() {
      const container = document.getElementById('channel-list');
      const countEl = document.getElementById('channel-count');
      container.innerHTML = '';
      countEl.innerText = CHANNELS.length;

      CHANNELS.forEach(ch => {
        const item = document.createElement('button');
        item.className = 'w-full text-left p-3 rounded-lg border border-white/5 bg-[#12131b]/40 hover:bg-[#1a1c29]/50 transition-colors flex items-center gap-3 cursor-pointer group focus:outline-none focus:border-purple-500/40';
        item.onclick = () => selectChannel(ch);

        const badge = document.createElement('div');
        badge.className = 'w-10 h-6 rounded flex items-center justify-center text-[9px] font-black tracking-widest text-white font-mono shrink-0';
        badge.style.backgroundColor = ch.accentColor || '#8c5cd0';
        badge.innerText = ch.logoText || 'LIVE';

        const textCont = document.createElement('div');
        textCont.className = 'overflow-hidden text-left';
        
        const numberSpan = document.createElement('span');
        numberSpan.className = 'text-[9px] font-mono text-purple-400 block';
        numberSpan.innerText = 'CH ' + ch.number;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'text-xs font-bold text-gray-200 group-hover:text-white truncate block';
        nameSpan.innerText = ch.name;

        textCont.appendChild(numberSpan);
        textCont.appendChild(nameSpan);
        item.appendChild(badge);
        item.appendChild(textCont);
        container.appendChild(item);
      });
    }

    function selectChannel(channel) {
      activeChannel = channel;
      document.getElementById('player-splash').style.opacity = '1';
      document.getElementById('player-splash').style.pointerEvents = 'auto';

      document.getElementById('splash-channel-name').innerText = channel.name;
      document.getElementById('splash-status-text').innerText = "Simulated Loop Ready";

      // Update tuning panel details
      document.getElementById('detail-channel-name').innerText = channel.name;
      document.getElementById('detail-channel-tag').innerText = channel.tagline || 'Direct scheduled IPTV stream.';
      document.getElementById('detail-channel-group').innerText = channel.category || 'General';
      document.getElementById('detail-channel-logo').style.backgroundColor = channel.accentColor || '#8c5cd0';

      const directUrl = channel.url || (channel.shows && channel.shows[0]?.episodes[0]?.url) || '';
      document.getElementById('detail-stream-url').innerText = directUrl;

      updateEPGAndSchedule();
      if (hasInteracted) {
        startActiveStream();
      }
    }

    function updateEPGAndSchedule() {
      if (!activeChannel) return;

      const now = Date.now();
      const liveInfo = getLiveEpisodeForChannel(activeChannel, now);

      // Main active show displays
      document.getElementById('live-epg-title').innerText = liveInfo.show.title;
      document.getElementById('live-epg-meta').innerText = 'S' + (liveInfo.episode.season || '1') + ' EP' + (liveInfo.episode.episodeNumber || '1') + ' • ' + liveInfo.episode.title;
      document.getElementById('detail-epg-status').innerHTML = '<svg class="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Active Show: ' + liveInfo.show.title;

      // Overlay player details
      document.getElementById('overlay-show-title').innerText = liveInfo.show.title;
      document.getElementById('overlay-episode-title').innerText = 'S' + (liveInfo.episode.season || '1') + ' EP' + (liveInfo.episode.episodeNumber || '1') + ' • ' + liveInfo.episode.title;

      // Render upcoming Slots list
      const slotsContainer = document.getElementById('epg-slots');
      slotsContainer.innerHTML = '';

      liveInfo.upcomingSlots.forEach(slot => {
        const sDiv = document.createElement('div');
        sDiv.className = 'p-2.5 rounded bg-[#11131c]/50 border border-white/5 flex items-center justify-between text-xs';
        
        const textSection = document.createElement('div');
        textSection.className = 'text-left';
        
        const label = document.createElement('span');
        label.className = 'text-[9px] font-mono text-purple-400 bg-purple-950/30 px-1.5 py-0.5 rounded border border-purple-500/10 mr-2';
        label.innerText = slot.timeLabel;

        const titleText = document.createElement('span');
        titleText.className = 'font-semibold text-gray-200';
        titleText.innerText = slot.show.title + ' - ' + slot.episode.title;

        textSection.appendChild(label);
        textSection.appendChild(titleText);

        const suffix = document.createElement('span');
        suffix.className = 'text-[9px] font-mono text-gray-500 uppercase tracking-widest';
        suffix.innerText = 'SLOT';

        sDiv.appendChild(textSection);
        sDiv.appendChild(suffix);
        slotsContainer.appendChild(sDiv);
      });
    }

    function startActiveStream() {
      if (!activeChannel) return;

      const video = document.getElementById('video-element');
      const splash = document.getElementById('player-splash');
      
      const now = Date.now();
      const liveInfo = getLiveEpisodeForChannel(activeChannel, now);
      const streamUrl = liveInfo.episode.url || activeChannel.url || '';

      if (!streamUrl) {
        document.getElementById('splash-status-text').innerText = "NO STREAM PATH FOUND";
        return;
      }

      // Hide Splash
      splash.style.opacity = '0';
      splash.style.pointerEvents = 'none';

      // Clean up previous HLS instances
      if (currentHlsInstance) {
        currentHlsInstance.destroy();
        currentHlsInstance = null;
      }

      const isHls = streamUrl.includes('.m3u8') || streamUrl.includes('m3u8');

      if (isHls && Hls.isSupported()) {
        const hls = new Hls({
          maxMaxBufferLength: 10,
          enableWorker: true
        });
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        currentHlsInstance = hls;

        hls.on(Hls.Events.MANIFEST_PARSED, function() {
          video.currentTime = liveInfo.seekOffsetSeconds;
          video.play().catch(e => console.log("Autoplay policy blocked or delayed play: " + e));
        });

        hls.on(Hls.Events.ERROR, function(event, data) {
          if (data.fatal) {
            console.warn("HLS fatal error encountered, trying recover: ", data);
            switch(data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                break;
            }
          }
        });
      } else {
        // Native HTML5 (MP4, WebM or safari HLS native support)
        video.src = streamUrl;
        video.load();
        
        video.oncanplay = function() {
          video.currentTime = liveInfo.seekOffsetSeconds;
          video.play().catch(e => console.log("Autoplay policy blocked native play: " + e));
        };
      }
    }

    // Bind interaction buttons
    document.getElementById('btn-start-play').onclick = function() {
      hasInteracted = true;
      startActiveStream();
    };

    // 4. INITIALIZE BOOTSTRAP
    window.onload = function() {
      updateClock();
      setInterval(updateClock, 1000);
      renderChannels();
      
      if (CHANNELS.length > 0) {
        selectChannel(CHANNELS[0]);
      }

      // Keep timeline synced up every 30 seconds
      setInterval(() => {
        updateEPGAndSchedule();
      }, 30000);
    };
  </script>
</body>
</html>`;
}
