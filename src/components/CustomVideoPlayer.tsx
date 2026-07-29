/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { PlaybackLog, Episode, Show, SubtitleCue } from '../types';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Volume1, AlertCircle, RefreshCw, Radio, HardDriveDownload, PictureInPicture, Info, X, Sparkles, Clock, Database, User, Subtitles, Edit3 } from 'lucide-react';
import { getCachedSegment, saveCachedSegment, getNearestCachedSegment, evictStaleSegments, isStale } from '../utils/segmentCache';

function parseSubtitles(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\n+/);
  
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block) continue;
    
    const lines = block.split('\n');
    if (lines.length < 2) continue;
    
    let timestampLine = '';
    let textStartIndex = 1;
    
    if (lines[0].includes('-->')) {
      timestampLine = lines[0];
      textStartIndex = 1;
    } else if (lines[1] && lines[1].includes('-->')) {
      timestampLine = lines[1];
      textStartIndex = 2;
    } else {
      continue;
    }
    
    const parseTime = (str: string): number => {
      const cleanStr = str.trim().replace(',', '.');
      const parts = cleanStr.split(':');
      if (parts.length === 0) return 0;
      
      const seconds = parseFloat(parts[parts.length - 1] || '0') || 0;
      const minutes = parseInt(parts[parts.length - 2] || '0', 10) || 0;
      const hours = parseInt(parts[parts.length - 3] || '0', 10) || 0;
      return hours * 3600 + minutes * 60 + seconds;
    };
    
    const partsOfTime = timestampLine.split('-->');
    if (partsOfTime.length < 2) continue;
    
    const startTime = parseTime(partsOfTime[0]);
    const endTime = parseTime(partsOfTime[1]);
    
    const textLines = lines.slice(textStartIndex);
    const text = textLines.join('\n').replace(/<[^>]*>/g, '').trim();
    
    if (text) {
      cues.push({
        id: String(i),
        start: startTime,
        end: endTime,
        text
      });
    }
  }
  return cues;
}

interface CustomVideoPlayerProps {
  episode: Episode;
  show: Show;
  channelId: string;
  channelName: string;
  isLiveMode: boolean;
  liveSeekOffset: number;
  onLogEvent: (type: PlaybackLog['type'], message: string, meta?: PlaybackLog['meta']) => void;
  isCinemaBackdrop?: boolean;
  videoFit?: 'cover' | 'contain';
  onEpisodeEnded?: () => void;
  schedulingMode?: 'hard-clocked' | 'continuous';
  onDurationProbed?: (durationMs: number) => void;
  nextEpisode?: Episode;
  onEditChannel?: () => void;
}

const getBackupUrls = (url: string, channelId: string): string[] => {
  const backups: string[] = [];
  const idLower = (channelId || '').toLowerCase();
  const urlLower = (url || '').toLowerCase();

  // If URL ends in .mpg on Archive.org, add _512kb.mp4 web-stream variant
  if (urlLower.endsWith('.mpg')) {
    backups.push(url.replace(/\.mpg$/i, '_512kb.mp4'));
  }

  // Highly reliable 206 Partial Content compliant MP4 video streams
  const hoganStream = 'https://archive.org/download/hogans-heroes-s-01-e-01-the-informer_202509/Hogan%27s%20Heroes_S03E19_Is%20There%20A%20Doctor%20In%20The%20House.mp4';
  const cnnStream = 'https://archive.org/download/9BAE07C3BFF5A47DF6E9861FD3E755CF5D130985D64A1ACF1CD104982F18E71D/CNN_Project.ia.mp4';
  const larryKingStream = 'https://archive.org/download/CNN_20010917_040000_Larry_King_Weekend/CNN_20010917_040000_Larry_King_Weekend.mp4';
  const dwStream = 'https://archive.org/download/linktv_globalpulse2010041610/globalpulse2010041610_512kb.mp4';
  const bet911Stream = 'https://archive.org/download/BET_20010913_140000_Videolink/BET_20010913_140000_Videolink.mp4';
  const oceansStream = 'https://vjs.zencdn.net/v/oceans.mp4';
  const flowerStream = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
  const muxTestStream = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

  if (idLower.includes('westerns') || idLower.includes('101')) {
    backups.push(hoganStream);
    backups.push(oceansStream);
    backups.push(flowerStream);
  } else if (idLower.includes('crime') || idLower.includes('102') || idLower.includes('retro-adventure')) {
    backups.push(hoganStream);
    backups.push(oceansStream);
    backups.push(flowerStream);
  } else if (idLower.includes('news') || idLower.includes('104') || idLower.includes('105')) {
    backups.push(cnnStream);
    backups.push(larryKingStream);
    backups.push(dwStream);
    backups.push(oceansStream);
  } else if (idLower.includes('911') || idLower.includes('106')) {
    backups.push(bet911Stream);
    backups.push(oceansStream);
  }

  // Universal fallback stack
  backups.push(hoganStream);
  backups.push(oceansStream);
  backups.push(muxTestStream);
  backups.push(flowerStream);

  return backups;
};

const prefetchNextStreamChunk = (nextStreamUrl: string) => {
  if (!nextStreamUrl) return;
  fetch(nextStreamUrl, {
    headers: { Range: 'bytes=0-1048576' }, // First 1MB chunk
  }).catch(() => {/* Silent fallback */});
};

const resetVideoElement = (videoEl: HTMLVideoElement | null) => {
  if (!videoEl) return;
  try {
    videoEl.pause();
    videoEl.removeAttribute('src');
    // Omitting load() after removeAttribute prevents dispatching MEDIA_ERR_SRC_NOT_SUPPORTED Code 4 error events
  } catch (err) {
    console.warn('[VRAM Decoder Flush]: Error resetting video element:', err);
  }
};

export function CustomVideoPlayer({
  episode,
  show,
  channelId,
  channelName,
  isLiveMode,
  liveSeekOffset,
  onLogEvent,
  isCinemaBackdrop = false,
  videoFit = 'contain',
  onEpisodeEnded,
  schedulingMode = 'hard-clocked',
  onDurationProbed,
  nextEpisode,
  onEditChannel,
}: CustomVideoPlayerProps) {
  const [activePlayer, setActivePlayer] = useState<'A' | 'B'>('A');
  const videoRefA = useRef<HTMLVideoElement>(null);
  const videoRefB = useRef<HTMLVideoElement>(null);

  const getActiveVideo = () => (activePlayer === 'A' ? videoRefA.current : videoRefB.current);
  const getIdleVideo = () => (activePlayer === 'A' ? videoRefB.current : videoRefA.current);

  const preArmedUrlRef = useRef<string | null>(null);
  const isIdleReadyRef = useRef<boolean>(false);

  const nextEpisodeRef = useRef(nextEpisode);
  useEffect(() => {
    nextEpisodeRef.current = nextEpisode;
  }, [nextEpisode]);

  const containerRef = useRef<HTMLDivElement>(null);
  const hasSeekedRef = useRef(false);
  const isMetadataLoadedRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stallTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const idleHlsRef = useRef<Hls | null>(null);

  const schedulingModeRef = useRef(schedulingMode);
  useEffect(() => {
    schedulingModeRef.current = schedulingMode;
  }, [schedulingMode]);

  const onEpisodeEndedRef = useRef(onEpisodeEnded);
  useEffect(() => {
    onEpisodeEndedRef.current = onEpisodeEnded;
  }, [onEpisodeEnded]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [isSplashActive, setIsSplashActive] = useState(true);
  const [isSplashFullyHidden, setIsSplashFullyHidden] = useState(false);
  const [playbackState, setPlaybackState] = useState<'idle' | 'loading' | 'playing' | 'stalled' | 'error'>('loading');
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPipActive, setIsPipActive] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);

  // Subtitles / Closed Captions State
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [currentSubtitleText, setCurrentSubtitleText] = useState<string>('');
  const [subtitlesEnabled, setSubtitlesEnabled] = useState<boolean>(true);

  const subtitleCuesRef = useRef<SubtitleCue[]>([]);
  useEffect(() => {
    subtitleCuesRef.current = subtitleCues;
  }, [subtitleCues]);

  // Scraped backup identifiers from @nker150 uploader
  const [scrapedBackupIdentifiers, setScrapedBackupIdentifiers] = useState<string[]>([]);

  useEffect(() => {
    // Silent background lazy-load of first 100 nker150 film identifiers
    const fetchArchivePool = async () => {
      try {
        const query = 'uploader:nker150 AND mediatype:movies';
        const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier&sort[]=downloads+desc&rows=100&output=json`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data?.response?.docs) {
            const ids = data.response.docs
              .map((doc: any) => doc.identifier)
              .filter(Boolean);
            if (ids.length > 0) {
              setScrapedBackupIdentifiers(ids);
              onLogEventRef.current('custom', `[Silent Scraping]: Lazy-loaded ${ids.length} high-fidelity fallback video identifiers from uploader @nker150.`);
            }
          }
        }
      } catch (err) {
        console.warn('Silent background scraping of Archive.org pool failed, using robust static seed:', err);
      }
    };
    fetchArchivePool();
  }, []);

  // Evict stale segments older than 48 hours on mount
  useEffect(() => {
    evictStaleSegments().catch((err) => console.warn('[Segment Cache] Eviction failed:', err));
  }, []);

  // Fail-safe URL state tracking
  const prevEpisodeRef = useRef({ id: episode.id, url: episode.url });
  const [currentSourceUrl, setCurrentSourceUrl] = useState(episode.url);
  const failedUrlsRef = useRef<string[]>([]);
  const probedEpisodesRef = useRef<Set<string>>(new Set());

  // Synchronize stream URL changes safely via useEffect to avoid render-phase state updates
  useEffect(() => {
    if (episode.id !== prevEpisodeRef.current.id || episode.url !== prevEpisodeRef.current.url) {
      prevEpisodeRef.current = { id: episode.id, url: episode.url };
      setCurrentSourceUrl(episode.url);
      failedUrlsRef.current = [];
    }
  }, [episode.id, episode.url]);

  // Fail-safe router (Dynamic, asynchronous, metadata-resolving)
  const triggerFallback = async () => {
    // 1. Check channel-specific highly stable backup URLs first (e.g. Al Jazeera English HLS or GCS MP4 files)
    const channelBackups = getBackupUrls(episode.url, episode.id);
    const unfailedBackups = channelBackups.filter(u => !failedUrlsRef.current.includes(u));
    if (unfailedBackups.length > 0) {
      const nextBackup = unfailedBackups[0];
      failedUrlsRef.current.push(currentSourceUrl);
      setCurrentSourceUrl(nextBackup);
      onLogEventRef.current('custom', `[Fail-safe Routing]: Channel stream failed. Seamlessly routing to highly stable backup: ${nextBackup}`);
      return;
    }

    const pool = scrapedBackupIdentifiers.length > 0 
      ? scrapedBackupIdentifiers 
      : [
          "hogans-heroes-s-01-e-01-the-informer_202509",
          "BET_20010913_140000_Videolink",
          "9BAE07C3BFF5A47DF6E9861FD3E755CF5D130985D64A1ACF1CD104982F18E71D",
          "bus-driver-predator-f0772650466e8bcfee878ec22310c42713751029c58a3ddba6b0d830448eefae",
          "linktv_globalpulse2010041610"
        ];

    // Find one that we haven't failed on yet
    const remainingIds = pool.filter(id => !failedUrlsRef.current.includes(id));
    if (remainingIds.length === 0) {
      // Fallback to verified open CDN streams if all archive links fail
      const lastResorts = [
        'https://vjs.zencdn.net/v/oceans.mp4',
        'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
      ];
      const fallbackUrl = lastResorts.find(r => !failedUrlsRef.current.includes(r));
      if (fallbackUrl) {
        failedUrlsRef.current.push(currentSourceUrl);
        setCurrentSourceUrl(fallbackUrl);
        onLogEventRef.current('custom', `[Fail-safe Routing]: All archive.org fallback links exhausted. Routing to last resort stream: ${fallbackUrl}`);
        return;
      }
      onLogEventRef.current('error', `All fail-safe backup feeds exhausted for "${episode.title}". Stream is temporarily offline.`);
      setPlaybackState('error');
      return;
    }

    // Select a random identifier from the remaining pool
    const randomIdx = Math.floor(Math.random() * remainingIds.length);
    const selectedIdentifier = remainingIds[randomIdx];

    onLogEventRef.current('custom', `[Fail-safe Routing]: Stream error or offline. Resolving direct MP4 metadata for Archive.org clip: "${selectedIdentifier}"...`);
    
    try {
      const metaRes = await fetch(`https://archive.org/metadata/${selectedIdentifier}`);
      if (!metaRes.ok) {
        throw new Error(`HTTP metadata fetch failed with status: ${metaRes.status}`);
      }
      const metaData = await metaRes.json();
      const files = metaData?.files || [];
      // Find high quality .mp4 file
      let mp4File = files.find((f: any) => f.name.endsWith('.mp4') && !f.name.endsWith('_512kb.mp4'));
      if (!mp4File) {
        mp4File = files.find((f: any) => f.name.endsWith('.mp4'));
      }

      if (mp4File) {
        const directUrl = `https://archive.org/download/${selectedIdentifier}/${encodeURIComponent(mp4File.name)}`;
        
        failedUrlsRef.current.push(currentSourceUrl);
        failedUrlsRef.current.push(selectedIdentifier);
        
        hasSeekedRef.current = false;
        setCurrentSourceUrl(directUrl);
        onLogEventRef.current('custom', `[Fail-safe Routing]: Seamlessly playing stable fallback movie clip: ${mp4File.name}`, {
          from: currentSourceUrl,
          to: directUrl,
        });
      } else {
        throw new Error(`No playable MP4 files found in item ${selectedIdentifier}`);
      }
    } catch (err: any) {
      console.warn(`Failed to resolve direct MP4 for identifier "${selectedIdentifier}":`, err);
      // Mark this identifier as failed and try another fallback immediately
      failedUrlsRef.current.push(selectedIdentifier);
      triggerFallback(); // Recurse to try another one!
    }
  };

  const triggerFallbackRef = useRef(triggerFallback);
  triggerFallbackRef.current = triggerFallback;

  // Press 'O' to toggle the accessibility overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'o') {
        const activeElem = document.activeElement;
        if (activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA')) {
          return;
        }
        e.preventDefault();
        setShowOverlay((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch and parse subtitles
  useEffect(() => {
    setSubtitleCues([]);
    setCurrentSubtitleText('');

    if (!episode.subtitleUrl) {
      onLogEventRef.current('custom', 'No subtitles provided for this news segment.');
      return;
    }

    onLogEventRef.current('custom', `Fetching closed caption subtitles from ${episode.subtitleUrl}...`);
    
    let isMounted = true;
    
    fetch(episode.subtitleUrl)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error fetching subtitles: ${res.status}`);
        }
        return res.text();
      })
      .then((text) => {
        if (!isMounted) return;
        const parsed = parseSubtitles(text);
        setSubtitleCues(parsed);
        onLogEventRef.current('custom', `Successfully loaded and parsed ${parsed.length} subtitle cues.`);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('Failed to load subtitles:', err);
        onLogEventRef.current('custom', `Closed caption fetch failed (CORS, network, or empty file): ${err.message}`);
      });

    return () => {
      isMounted = false;
    };
  }, [episode.subtitleUrl]);

  // Synchronize fullscreen state with browser's native fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Synchronize Picture-in-Picture state with browser's native changes
  useEffect(() => {
    const video = getActiveVideo();
    if (!video) return;

    const handleEnterPip = () => {
      setIsPipActive(true);
      onLogEventRef.current('custom', `Picture-in-Picture mode started`);
    };
    const handleLeavePip = () => {
      setIsPipActive(false);
      onLogEventRef.current('custom', `Picture-in-Picture mode stopped`);
    };

    video.addEventListener('enterpictureinpicture', handleEnterPip);
    video.addEventListener('leavepictureinpicture', handleLeavePip);

    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnterPip);
      video.removeEventListener('leavepictureinpicture', handleLeavePip);
    };
  }, [hasUserInteracted]);

  const isLiveModeRef = useRef(isLiveMode);
  const liveSeekOffsetRef = useRef(liveSeekOffset);
  const onLogEventRef = useRef(onLogEvent);

  // Keep refs perfectly synchronized with props to prevent stale closure blocks in video event listeners
  useEffect(() => {
    isLiveModeRef.current = isLiveMode;
  }, [isLiveMode]);

  useEffect(() => {
    liveSeekOffsetRef.current = liveSeekOffset;
  }, [liveSeekOffset]);

  useEffect(() => {
    onLogEventRef.current = onLogEvent;
  }, [onLogEvent]);

  // Synchronize player volume/muted states cleanly across both players
  useEffect(() => {
    const activeVid = getActiveVideo();
    if (activeVid) {
      activeVid.volume = volume;
      activeVid.muted = isMuted;
    }
  }, [volume, isMuted, activePlayer]);

  // Restart video ONLY when the selected episode URL changes or active player toggles, managing all event listeners in a stable cycle
  useEffect(() => {
    const video = getActiveVideo();
    if (!video) return;

    hasSeekedRef.current = false; // Reset seeking flag on stream URL change!
    isMetadataLoadedRef.current = false;
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setIsSplashActive(true);
    setIsSplashFullyHidden(false);
    setPlaybackState('loading');

    onLogEventRef.current('custom', `Initializing video stream for ${show.title} - S${episode.season || '01'}E${episode.episodeNumber || '01'}: ${episode.title}`, {
      channelId: episode.id,
      episodeId: episode.id,
    });

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Synchronize initial volume and mute states
    video.volume = volume;
    video.muted = isMuted;

    // Unified telemetry, recovery, and UI update event handlers
    const onPlaying = () => {
      if (stallTimeoutRef.current) {
        clearTimeout(stallTimeoutRef.current);
        stallTimeoutRef.current = null;
      }
      retryCountRef.current = 0; // Reset retry counter on successful playback
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      setIsPlaying(true);
      setPlaybackState('playing');
      onLogEventRef.current('playing', `[Playback Health]: Stream active`, {
        time: video.currentTime,
        buffered: getBufferRange(video),
        readyState: video.readyState,
      });

      // Once it plays, fade out splash/branding layer
      setTimeout(() => {
        setIsSplashActive(false);
        setTimeout(() => {
          setIsSplashFullyHidden(true);
        }, 700);
      }, 500);
    };

    const onWaiting = () => {
      setPlaybackState('loading');
      console.warn(`[Playback Health]: waiting`, {
        currentTime: video.currentTime,
        bufferEnd: video.buffered.length ? video.buffered.end(0) : 0,
        networkState: video.networkState
      });
      onLogEventRef.current('waiting', `[Playback Health]: Buffering stream / seeking packet blocks`, {
        time: video.currentTime,
        buffered: getBufferRange(video),
        readyState: video.readyState,
      });
    };

    const onStalled = () => {
      setPlaybackState('stalled');
      console.warn(`[Playback Health]: stalled`, {
        currentTime: video.currentTime,
        bufferEnd: video.buffered.length ? video.buffered.end(0) : 0,
        networkState: video.networkState
      });
      onLogEventRef.current('stalled', `[Playback Health]: Buffer stalled, awaiting network segments`, {
        time: video.currentTime,
        buffered: getBufferRange(video),
        readyState: video.readyState,
      });

      // Auto-Retry on Decoder Stall: Schedule a 7-second recovery timeout
      if (stallTimeoutRef.current) clearTimeout(stallTimeoutRef.current);
      stallTimeoutRef.current = setTimeout(() => {
        if (isCancelled) return;
        const activeVid = getActiveVideo();
        if (activeVid && activeVid.paused === false && activeVid.readyState < 3) {
          onLogEventRef.current('warning', '[Decoder Stall Recovery]: Stream stalled over 7s. Re-loading buffer stream...');
          if (hlsRef.current) {
            hlsRef.current.startLoad();
          } else {
            activeVid.load();
            activeVid.play().catch(() => {});
          }
        }
      }, 7000);
    };

    const onError = () => {
      if (isCancelled) return;
      const srcAttr = video.getAttribute('src');
      if (!srcAttr && !hlsRef.current) {
        return;
      }

      const err = video.error;

      // Check if it is an abort error (code 1: MEDIA_ERR_ABORTED).
      // If it is, this is just a normal side-effect of shifting sources or tearing down HLS, so we safely bypass it.
      if (err && err.code === 1) {
        console.log('[Playback Health]: Media load aborted (code 1) - typical during stream/source transition.');
        return;
      }

      // Check if code 4 occurs when src is empty or cleared
      if (err && err.code === 4 && (!video.src || video.src === '' || video.src === window.location.href)) {
        console.log('[Playback Health]: Ignoring code 4 on cleared video element.');
        return;
      }

      setPlaybackState('error');
      setIsSplashActive(true); // Bring up blur placeholder on stream stalls
      setIsSplashFullyHidden(false);

      const errDetails = err
        ? `Code: ${err.code} (${err.code === 2 ? 'Network Error' : err.code === 3 ? 'Decode Error' : err.code === 4 ? 'Source Not Supported' : 'Unknown Error'}), Message: ${err.message || 'No message'}`
        : 'Unknown HTML5 video error';

      console.warn(`[Playback Health]: error`, errDetails, {
        currentTime: video.currentTime,
        bufferEnd: video.buffered.length ? video.buffered.end(0) : 0,
        networkState: video.networkState
      });

      onLogEventRef.current('error', `[Playback Health]: Stream decode error or resource missing at source (${errDetails})`, {
        time: video.currentTime,
        buffered: getBufferRange(video),
        readyState: video.readyState,
      });

      // Stream Error 2.5s Backoff / Retry
      // Note: If error code is 4 (MEDIA_ERR_SRC_NOT_SUPPORTED or CORS/format error), retrying activeVid.load() on the same URL will always fail again.
      // Immediately trigger fallback stream to eliminate flashing/stalling.
      if (err && err.code === 4) {
        onLogEventRef.current('warning', `[Stream Recovery]: Source not supported or format error (Code 4). Immediately triggering failover fallback stream.`);
        triggerFallbackRef.current();
        return;
      }

      if (retryCountRef.current < 3) {
        retryCountRef.current += 1;
        onLogEventRef.current('warning', `[Stream Recovery]: Stream error encountered (${errDetails}). Backing off for 2.5 seconds before retry attempt #${retryCountRef.current}...`, {
          attempt: retryCountRef.current,
          url: currentSourceUrl
        });

        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = setTimeout(() => {
          if (isCancelled) return;
          const activeVid = getActiveVideo();
          if (activeVid) {
            console.log(`[Stream Recovery]: Executing 2.5s backoff retry #${retryCountRef.current} on current stream...`);
            if (hlsRef.current) {
              hlsRef.current.startLoad();
            } else {
              activeVid.load();
              activeVid.play().catch(() => {});
            }
          }
        }, 2500);
        return;
      }

      onLogEventRef.current('error', `[Playback Health]: Stream retries exhausted after 2.5s backoffs. Triggering failover fallback URL (${errDetails})`, {
        time: video.currentTime,
        buffered: getBufferRange(video),
        readyState: video.readyState,
      });

      // Try fail-safe fallback routing ONLY after 2.5s retries fail
      triggerFallbackRef.current();
    };

    const syncProbedDuration = (actualSecs: number) => {
      if (actualSecs && actualSecs > 0 && actualSecs !== Infinity && !isNaN(actualSecs)) {
        const durationMs = Math.round(actualSecs * 1000);
        const currentEpDuration = episode.durationMs || (episode.runtimeMins ? episode.runtimeMins * 60 * 1000 : 30 * 60 * 1000);
        
        const isLiveHlsStream = currentSourceUrl.includes('.m3u8') || currentSourceUrl.includes('m3u8');
        const isCommercial = (episode as any).isCommercialFill || episode.id?.startsWith('ep-commercial') || episode.id?.startsWith('ep-filler');

        if (channelId && episode.id && !isLiveHlsStream && !isCommercial && Math.abs(currentEpDuration - durationMs) > 4000) {
          if (probedEpisodesRef.current.has(episode.id)) return;
          probedEpisodesRef.current.add(episode.id);

          console.log(`[Duration Prober Sync] Discrepancy detected for episode ${episode.id}: current=${currentEpDuration}ms, actual=${durationMs}ms`);
          fetch('/api/channels/update-duration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId, episodeId: episode.id, durationMs })
          })
          .then(async res => {
            const contentType = res.headers.get('content-type');
            if (res.status === 404) {
              return { success: false, is404: true };
            }
            if (!res.ok || !contentType || !contentType.includes('application/json')) {
              const text = await res.text();
              throw new Error(`Server returned status ${res.status} (${res.statusText}) with content-type "${contentType}": ${text.slice(0, 150)}`);
            }
            return res.json();
          })
          .then(data => {
            if (data && data.success) {
              onLogEventRef.current('custom', `[Duration Prober Sync]: Successfully synchronized exact parsed video duration (${Math.round(actualSecs)}s) to backend.`);
              if (onDurationProbed) {
                onDurationProbed(durationMs);
              }
            } else if (data && data.is404) {
              console.log(`[Duration Prober Sync]: Episode ${episode.id} not registered in static EPG database.`);
            }
          })
          .catch(err => {
            console.warn('[Duration Prober Sync]: Note on duration probe:', err.message || err);
          });
        }
      }
    };

    const onEnded = () => {
      onLogEventRef.current('custom', `Episode ended naturally: "${episode.title}"`);

      const idleVid = getIdleVideo();
      const currentVid = getActiveVideo();

      const executeHandoff = () => {
        if (!idleVid) return;
        onLogEventRef.current('custom', `[Dual-Player Engine]: Executing zero-stutter A/B swap handoff to pre-buffered idle player!`);

        idleVid.play().then(() => {
          setHasUserInteracted(true);
        }).catch((err) => {
          console.warn('[Dual-Player Engine]: Pre-armed play blocked, retrying muted...', err);
          idleVid.muted = true;
          idleVid.play().catch(() => {});
        });

        // Swap active and idle HLS instances cleanly
        const tempHls = hlsRef.current;
        hlsRef.current = idleHlsRef.current;
        idleHlsRef.current = tempHls;

        if (idleHlsRef.current) {
          try {
            idleHlsRef.current.detachMedia();
            idleHlsRef.current.destroy();
          } catch (e) {}
          idleHlsRef.current = null;
        }

        setActivePlayer(prev => (prev === 'A' ? 'B' : 'A'));

        if (currentVid) {
          resetVideoElement(currentVid);
        }

        preArmedUrlRef.current = null;
        isIdleReadyRef.current = false;

        if (onEpisodeEndedRef.current) {
          onEpisodeEndedRef.current();
        }
      };

      if (idleVid && preArmedUrlRef.current) {
        if (isIdleReadyRef.current || idleVid.readyState >= 2) {
          executeHandoff();
        } else {
          onLogEventRef.current('custom', `[Dual-Player Engine]: Idle player pre-buffer pending (readyState=${idleVid.readyState}). Awaiting canplay event for clean transition...`);
          const onIdleReady = () => {
            idleVid.removeEventListener('canplay', onIdleReady);
            idleVid.removeEventListener('canplaythrough', onIdleReady);
            executeHandoff();
          };
          idleVid.addEventListener('canplay', onIdleReady);
          idleVid.addEventListener('canplaythrough', onIdleReady);

          setTimeout(() => {
            idleVid.removeEventListener('canplay', onIdleReady);
            idleVid.removeEventListener('canplaythrough', onIdleReady);
            executeHandoff();
          }, 4000);
        }
      } else {
        if (isLiveModeRef.current) {
          if (schedulingModeRef.current === 'hard-clocked') {
            onLogEventRef.current('custom', `[Playout Loop]: Hard-Clocked mode active. Show segment ended early. Repeating from the beginning to fill dead air space until hard cut.`);
            if (currentVid) {
              currentVid.currentTime = 0;
              currentVid.play().catch(() => {});
            }
          } else {
            if (onEpisodeEndedRef.current) {
              onEpisodeEndedRef.current();
            }
          }
        } else {
          if (onEpisodeEndedRef.current) {
            onEpisodeEndedRef.current();
          }
        }
      }
    };

    const onTimeUpdate = () => {
      const time = video.currentTime;
      setCurrentTime(time);
      setBufferedEnd(getBufferRange(video));

      const startMatch = episode.url.match(/[?&]start=(\d+)/);
      const startOffset = startMatch ? parseInt(startMatch[1], 10) : 0;

      const absoluteTime = time + startOffset;
      const activeCue = subtitleCuesRef.current.find(
        cue => absoluteTime >= cue.start && absoluteTime <= cue.end
      );

      if (activeCue) {
        setCurrentSubtitleText(activeCue.text);
      } else {
        setCurrentSubtitleText('');
      }

      // Pre-Arming & Queue Management Engine
      if (video.duration && !isNaN(video.duration) && video.duration > 0) {
        const remainingSec = video.duration - time;
        if (remainingSec > 0 && remainingSec <= 20) {
          const targetNextUrl = nextEpisodeRef.current?.url || getBackupUrls(episode.url, episode.id)[0];
          if (targetNextUrl && preArmedUrlRef.current !== targetNextUrl) {
            prefetchNextStreamChunk(targetNextUrl);
            const idleVid = getIdleVideo();
            if (idleVid) {
              preArmedUrlRef.current = targetNextUrl;
              isIdleReadyRef.current = false;
              onLogEventRef.current('custom', `[Dual-Player Engine]: Pre-arming idle player (${activePlayer === 'A' ? 'Player B' : 'Player A'}) with upcoming segment stream: ${targetNextUrl}`);

              if (idleHlsRef.current) {
                try {
                  idleHlsRef.current.detachMedia();
                  idleHlsRef.current.destroy();
                } catch (e) {}
                idleHlsRef.current = null;
              }

              const isTargetHls = targetNextUrl.includes('.m3u8') || targetNextUrl.includes('m3u8');
              if (isTargetHls && Hls.isSupported()) {
                const hls = new Hls({
                  enableWorker: true,
                  lowLatencyMode: true,
                  backBufferLength: 60,
                });
                hls.loadSource(targetNextUrl);
                hls.attachMedia(idleVid);
                idleHlsRef.current = hls;
              } else if (isTargetHls && idleVid.canPlayType('application/vnd.apple.mpegurl')) {
                idleVid.src = targetNextUrl;
                idleVid.volume = volume;
                idleVid.muted = isMuted;
                idleVid.preload = 'auto';
                idleVid.load();
              } else {
                idleVid.removeAttribute('src');
                idleVid.load();
                idleVid.src = targetNextUrl;
                idleVid.volume = volume;
                idleVid.muted = isMuted;
                idleVid.preload = 'auto';
                idleVid.load();
              }

              const onIdleCanPlay = () => {
                isIdleReadyRef.current = true;
                onLogEventRef.current('custom', `[Dual-Player Engine]: Idle player pre-buffered & ready (readyState=${idleVid.readyState})`);
                idleVid.removeEventListener('canplay', onIdleCanPlay);
                idleVid.removeEventListener('canplaythrough', onIdleCanPlay);
              };

              if (idleVid.readyState >= 3) {
                onIdleCanPlay();
              } else {
                idleVid.addEventListener('canplay', onIdleCanPlay);
                idleVid.addEventListener('canplaythrough', onIdleCanPlay);
              }
            }
          }
        }
      }
    };

    const applyLiveSeek = () => {
      if (!isLiveModeRef.current || hasSeekedRef.current) return;
      
      const rawOffset = liveSeekOffsetRef.current;
      if (rawOffset <= 0) {
        hasSeekedRef.current = true; // Mark seek evaluated so 0s offset doesn't re-trigger checks
        return;
      }

      const actualDuration = video.duration;
      if (actualDuration && actualDuration > 0 && actualDuration !== Infinity && !isNaN(actualDuration)) {
        hasSeekedRef.current = true;
        const safeOffset = rawOffset % actualDuration;
        const safeSeekTime = Math.min(safeOffset, Math.max(0, actualDuration - 0.5));
        if (Math.abs(video.currentTime - safeSeekTime) > 1.5) {
          video.currentTime = safeSeekTime;
          onLogEventRef.current('custom', `Seeking to live-sync offset: ${Math.round(safeSeekTime)}s (actual duration: ${Math.round(actualDuration)}s, raw offset: ${Math.round(rawOffset)}s)`);
        }
      }
    };

    const applyPlayoutSeek = () => {
      if (hasSeekedRef.current) return;
      if (!isMetadataLoadedRef.current && video.readyState < 1) {
        console.log('[Seek Deferral]: Video metadata not yet loaded (readyState < 1). Deferring currentTime seek until loadedmetadata event.');
        return;
      }

      if (isLiveModeRef.current) {
        applyLiveSeek();
      } else {
        const isBackupUrl = currentSourceUrl.includes('archive.org/');
        if (isBackupUrl) {
          const actualDuration = video.duration;
          if (actualDuration && actualDuration > 0 && actualDuration !== Infinity && !isNaN(actualDuration)) {
            hasSeekedRef.current = true;
            const minOffset = 10;
            const maxOffset = Math.min(300, actualDuration * 0.3);
            const safeMax = maxOffset > minOffset ? maxOffset : 60;
            const randomOffset = minOffset + Math.random() * (safeMax - minOffset);
            
            video.currentTime = randomOffset;
            onLogEventRef.current('custom', `[Backup Playout Mode]: Started playing backup clip at random offset: ${Math.round(randomOffset)}s (Total clip duration: ${Math.round(actualDuration)}s)`);
          }
        }
      }
    };

    const onDurationChange = () => {
      const dur = video.duration || 0;
      setDuration(dur);
      if (isMetadataLoadedRef.current) applyPlayoutSeek();
      syncProbedDuration(dur);
    };

    const onLoadedMetadata = () => {
      isMetadataLoadedRef.current = true;
      const dur = video.duration || 0;
      setDuration(dur);
      applyPlayoutSeek();
      syncProbedDuration(dur);
    };

    const handleCanPlay = () => {
      // Apply live or backup seek safely and exactly once per load
      applyPlayoutSeek();

      // Attempt standard autoplay immediately, falling back to muted autoplay if browser security blocks it
      video.play()
        .then(() => {
          setHasUserInteracted(true);
        })
        .catch((err) => {
          if (err && err.name === 'AbortError') {
            console.log('[Playback Health]: play() request aborted because a new load was initiated.');
            return;
          }
          console.log('[Autoplay]: Standard play blocked, trying muted: ', err);
          setIsMuted(true);
          video.muted = true;
          video.play()
            .then(() => {
              setHasUserInteracted(true);
            })
            .catch((err2) => {
              if (err2 && err2.name === 'AbortError') {
                console.log('[Playback Health]: Muted play() request aborted because a new load was initiated.');
                return;
              }
              console.error('[Autoplay]: Muted play also blocked: ', err2);
            });
        });
    };

    // Bind event listeners IMMEDIATELY before setting video sources or creating Hls elements
    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('stalled', onStalled);
    video.addEventListener('error', onError);
    video.addEventListener('ended', onEnded);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('canplay', handleCanPlay);

    const sendTelemetry = (eventName: string, payload: any) => {
      try {
        navigator.sendBeacon('/api/telemetry/log', JSON.stringify({
          event: eventName,
          timestamp: new Date().toISOString(),
          channelId: (episode && episode.id && typeof episode.id === 'string') ? (episode.id.split('-')[0] || 'unknown-channel') : 'unknown-channel',
          channelName,
          episodeId: episode?.id || '',
          episodeTitle: episode?.title || '',
          ...payload
        }));
        console.log(`[Telemetry Beacon Sent] Event: ${eventName}`, payload);
      } catch (e) {
        console.error('[Telemetry Beacon Failed]', e);
      }
    };

    const attachTelemetryObservers = (videoElement: HTMLVideoElement) => {
      const onWaitingStall = () => {
        const stallTime = Date.now();
        const resolveStall = () => {
          const duration = (Date.now() - stallTime) / 1000;
          if (duration > 3.0) {
            sendTelemetry('playback_stall', {
              durationSeconds: duration,
              readyState: videoElement.readyState,
              networkState: videoElement.networkState
            });
          }
          checkStallResolution();
        };
        const checkStallResolution = () => {
          videoElement.removeEventListener('playing', resolveStall);
        };
        videoElement.addEventListener('playing', resolveStall, { once: true });
      };

      videoElement.addEventListener('waiting', onWaitingStall);

      const checkOpaqueResource = () => {
        try {
          const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
          const matchingEntry = entries.find(e => e.name === currentSourceUrl || e.name.includes(currentSourceUrl));
          if (matchingEntry && matchingEntry.transferSize === 0) {
            sendTelemetry('opaque_resource_detected', {
              url: currentSourceUrl,
              transferSize: matchingEntry.transferSize,
              cause: 'Timing-Allow-Origin or CORS headers missing on streaming server'
            });
          }
        } catch (e) {
          console.warn('PerformanceResourceTiming query skipped:', e);
        }
      };

      videoElement.addEventListener('loadedmetadata', checkOpaqueResource);

      return () => {
        videoElement.removeEventListener('waiting', onWaitingStall);
        videoElement.removeEventListener('loadedmetadata', checkOpaqueResource);
      };
    };

    const initializeVideoSource = (url: string, videoElement: HTMLVideoElement) => {
      // Clean up zero-duration or invalid clip parameters before initiating playback
      let sanitizedUrl = url;
      if (url.includes('archive.org/') && (url.includes('?t=') || url.includes('&t='))) {
        const tMatch = url.match(/[?&]t=([^&]+)/);
        if (tMatch) {
          const tVal = tMatch[1];
          const parts = tVal.split('/');
          if (parts.length === 2 && (parts[0] === '0' && parts[1] === '0' || parts[0] === parts[1])) {
            // Safely strip the invalid parameter
            sanitizedUrl = url.replace(new RegExp(`[?&]t=${tVal.replace(/\//g, '\\/')}`), '');
            sanitizedUrl = sanitizedUrl.replace(/\?&/, '?').replace(/&&\s*$/, '').replace(/\?\s*$/, '');
            console.warn(`[Video Player] Stripped invalid zero-duration serve parameter from: ${url} -> ${sanitizedUrl}`);
          }
        }
      }

      // Automatically resolve stream URL if URL points to a .json file or playlist
      if (sanitizedUrl.toLowerCase().includes('.json')) {
        onLogEventRef.current('custom', `[JSON Playlist Stream Resolver]: Resolving stream video URL from playlist JSON: ${sanitizedUrl}...`);
        fetch(sanitizedUrl)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          })
          .then((data) => {
            let streamUrl = '';
            if (Array.isArray(data)) {
              streamUrl = data[0]?.url || data[0]?.m4vUrl || data[0]?.fallbackUrl || data[0]?.src || data[0]?.link || '';
            } else if (data && typeof data === 'object') {
              const list = data.items || data.playlist || data.episodes || data.shows || [];
              if (list[0]) {
                streamUrl = list[0].url || list[0].m4vUrl || list[0].fallbackUrl || list[0].src || list[0].link || '';
              }
            }
            if (streamUrl) {
              onLogEventRef.current('custom', `[JSON Playlist Stream Resolver]: Successfully resolved direct stream URL: ${streamUrl}`);
              initializeVideoSource(streamUrl, videoElement);
            } else {
              onLogEventRef.current('warning', `[JSON Playlist Stream Resolver]: No valid stream URL found in JSON playlist. Triggering failover...`);
              triggerFallbackRef.current();
            }
          })
          .catch((err) => {
            console.warn('[JSON Playlist Stream Resolver] Failed to fetch or parse JSON URL:', err);
            onLogEventRef.current('warning', `[JSON Playlist Stream Resolver]: Failed to parse JSON playlist. Triggering failover stream...`);
            triggerFallbackRef.current();
          });
        return;
      }

      if ((window as any).currentHlsInstance) {
        try {
          (window as any).currentHlsInstance.detachMedia();
          (window as any).currentHlsInstance.destroy();
        } catch (e) {}
        (window as any).currentHlsInstance = null;
      }
      if (hlsRef.current) {
        try {
          hlsRef.current.detachMedia();
          hlsRef.current.destroy();
        } catch (e) {}
        hlsRef.current = null;
      }

      // Safe clean-up of video element source and properties before binding a new source
      try {
        videoElement.pause();
        videoElement.removeAttribute('src');
      } catch (e) {
        console.warn('[Video Player Reset]: Error resetting media element state: ', e);
      }

      const isHlsUrl = sanitizedUrl.includes('.m3u8') || sanitizedUrl.includes('m3u8');

      if (isHlsUrl) {
        if (Hls.isSupported()) {
          const hls = new Hls({
            fragLoadingTimeOut: 20000,
            manifestLoadingTimeOut: 10000,
            enableWorker: true
          });
          hls.loadSource(sanitizedUrl);
          hls.attachMedia(videoElement);
          hlsRef.current = hls;
          (window as any).currentHlsInstance = hls;

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            handleCanPlay();
          });

          hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
              if (isCancelled) return;
              console.warn('HLS fatal error inside custom player, routing recover: ', data);
              sendTelemetry('hls_fatal_error', {
                errorType: data.type,
                errorDetails: data.details,
                isNetwork: data.type === Hls.ErrorTypes.NETWORK_ERROR
              });

              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  console.warn('[Playback Health]: HLS Network Error. Attempting segment reload recovery...');
                  onLogEventRef.current('custom', '[Playback Health]: HLS Transient Network Error. Retrying loader...');
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  hls.recoverMediaError();
                  break;
                default:
                  onLogEventRef.current('custom', '[Playback Health]: HLS Fatal Error. Triggering fallback stream...', data);
                  triggerFallbackRef.current();
                  break;
              }
            }
          });
        } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
          videoElement.src = sanitizedUrl;
          videoElement.load();
        } else {
          sendTelemetry('media_routing_error', {
            url: sanitizedUrl,
            cause: 'HLS (.m3u8) stream loaded but MSE and hls.js are not supported, and native HLS playback is unavailable'
          });
        }
      } else {
        videoElement.src = sanitizedUrl;
        videoElement.load();
      }
    };

    // Call routing and telemetry observers
    let isCancelled = false;
    let objectUrlToRevoke: string | null = null;
    const detachTelemetry = attachTelemetryObservers(video);

    const checkAndLoadStream = async () => {
      const isArchiveSegment = currentSourceUrl.includes('archive.org') && currentSourceUrl.includes('.mp4');
      let finalSourceUrl = currentSourceUrl;

      if (isArchiveSegment) {
        const segmentId = episode.id;
        const outlet = channelName || 'Archive';
        
        try {
          const cached = await getCachedSegment(segmentId);
          
          if (cached && !isStale(cached)) {
            onLogEventRef.current('custom', `[Segment Cache]: Cache HIT for segment ${segmentId}. Playing from local memory.`);
            if (isCancelled) return;
            objectUrlToRevoke = URL.createObjectURL(cached.blob);
            finalSourceUrl = objectUrlToRevoke;
          } else {
            // Direct native HTML5 playback for instant streaming without blocking fetch timeouts or CORS delays
            onLogEventRef.current('custom', `[Direct Playback]: Streaming directly via native HTML5 media engine for ${segmentId}.`);
          }
        } catch (err: any) {
          console.warn(`[Segment Cache] Cache lookup skipped for ${segmentId}:`, err);
        }
      }

      if (isCancelled) {
        if (objectUrlToRevoke) {
          URL.revokeObjectURL(objectUrlToRevoke);
        }
        return;
      }

      initializeVideoSource(finalSourceUrl, video);
      
      // Workaround/Safety: if the stream is cached or loaded synchronously before event listeners resolve, trigger handleCanPlay
      if (video.readyState >= 2) {
        handleCanPlay();
      }
    };

    checkAndLoadStream();

    return () => {
      isCancelled = true;
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('stalled', onStalled);
      video.removeEventListener('error', onError);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('canplay', handleCanPlay);

      detachTelemetry();

      // Pause video elements without triggering load() error events on empty sources
      [videoRefA.current, videoRefB.current].forEach((v) => {
        if (v) {
          try {
            v.pause();
          } catch (e) {}
        }
      });

      if ((window as any).currentHlsInstance) {
        try {
          (window as any).currentHlsInstance.detachMedia();
          (window as any).currentHlsInstance.destroy();
        } catch (e) {}
        (window as any).currentHlsInstance = null;
      }
      if (hlsRef.current) {
        try {
          hlsRef.current.detachMedia();
          hlsRef.current.destroy();
        } catch (e) {}
        hlsRef.current = null;
      }
      if (idleHlsRef.current) {
        try {
          idleHlsRef.current.detachMedia();
          idleHlsRef.current.destroy();
        } catch (e) {}
        idleHlsRef.current = null;
      }
    };
  }, [currentSourceUrl, episode.id]);

  // Safely extract active video buffer end
  const getBufferRange = (video: HTMLVideoElement): number => {
    if (video.buffered && video.buffered.length > 0) {
      // Find the range that covers current time
      const time = video.currentTime;
      for (let i = 0; i < video.buffered.length; i++) {
        if (video.buffered.start(i) <= time && video.buffered.end(i) >= time) {
          return video.buffered.end(i);
        }
      }
      return video.buffered.end(0);
    }
    return 0;
  };

  // Stuck detection loop to handle playback frozen state/rapid waiting loop
  useEffect(() => {
    const video = getActiveVideo();
    if (!video) return;

    let lastTime = video.currentTime;
    let lastChecked = Date.now();
    let consecutiveStuckCount = 0;

    const interval = setInterval(() => {
      if (video) {
        // Do NOT intervene if paused, ended, actively seeking, or buffering (readyState < 3)
        if (video.paused || video.ended || video.seeking || video.readyState < 3) {
          lastTime = video.currentTime;
          lastChecked = Date.now();
          return;
        }

        const now = Date.now();
        const curTime = video.currentTime;

        if (curTime === lastTime) {
          const durationSinceLastAdvance = now - lastChecked;
          // Allow up to 6 seconds for network buffer stalls before attempting a tiny time nudge
          if (durationSinceLastAdvance >= 6000) {
            consecutiveStuckCount++;
            if (consecutiveStuckCount <= 3) {
              onLogEventRef.current('waiting', `[Playback Health]: Playback stalled at ${curTime.toFixed(3)}s. Nudging currentTime by +0.2s (Attempt #${consecutiveStuckCount}/3)`);
              const targetTime = Math.min(video.duration || Infinity, curTime + 0.2);
              video.currentTime = targetTime;
            } else {
              onLogEventRef.current('error', `[Playback Health]: Stalled permanently at ${curTime.toFixed(3)}s after 3 nudges. Triggering fail-safe fallback stream.`);
              triggerFallbackRef.current();
              consecutiveStuckCount = 0;
            }
            lastChecked = Date.now();
          }
        } else {
          // Time advanced naturally, reset tracking
          lastTime = curTime;
          lastChecked = now;
          consecutiveStuckCount = 0;
        }
      }
    }, 500);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // User trigger to initiate initial play
  const startStream = () => {
    const video = getActiveVideo();
    if (!video) return;
    setHasUserInteracted(true);
    video.play().catch(() => {});
    onLogEvent('custom', `User clicked start stream command`);
  };

  const togglePlay = () => {
    const video = getActiveVideo();
    if (!video) return;
    if (!hasUserInteracted) {
      startStream();
      return;
    }
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
      onLogEvent('custom', `Playback command: Paused`);
    } else {
      video.play().catch(() => {});
      setIsPlaying(true);
      onLogEvent('custom', `Playback command: Resumed`);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setVolume(value);
    setIsMuted(value === 0);
    const video = getActiveVideo();
    if (video) {
      video.volume = value;
      video.muted = value === 0;
    }
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    const video = getActiveVideo();
    if (video) {
      video.muted = newMuted;
    }
    onLogEvent('custom', `Audio command: ${newMuted ? 'Muted' : 'Unmuted'}`);
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = parseFloat(e.target.value);
    setCurrentTime(targetTime);
    const video = getActiveVideo();
    if (video) {
      video.currentTime = targetTime;
    }
    onLogEvent('custom', `Scrub timeline to ${Math.round(targetTime)}s`);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      onLogEvent('custom', `Interface scale: Fullscreen activated`);
    } else {
      document.exitFullscreen().catch(() => {});
      onLogEvent('custom', `Interface scale: Fullscreen exited`);
    }
  };

  const togglePictureInPicture = async () => {
    const video = getActiveVideo();
    if (!video) return;

    if (!('pictureInPictureEnabled' in document) || !(document as any).pictureInPictureEnabled) {
      onLogEvent('custom', 'Warning: Picture-in-Picture is not supported or is disabled in this browser');
      return;
    }

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (err) {
      onLogEvent('custom', `Error toggling Picture-in-Picture: ${(err as Error).message}`);
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const currentPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      id={isCinemaBackdrop ? "video-canvas-container" : "custom-video-player"}
      className={
        isCinemaBackdrop
          ? "fixed inset-0 w-screen h-screen z-1 bg-black overflow-hidden select-none flex flex-col justify-between video-player-container"
          : "relative z-10 aspect-video max-w-5xl mx-auto w-full min-h-[360px] bg-black overflow-hidden border border-white/10 rounded-xl shadow-2xl group flex flex-col justify-between video-player-container"
      }
    >
      {/* Layer 0: Dual Video Element Architecture */}
      <div className="absolute inset-0 w-full h-full bg-black overflow-hidden">
        <video
          ref={videoRefA}
          id="player-a"
          className={
            isCinemaBackdrop
              ? `absolute inset-0 w-full h-full cursor-pointer ${
                  videoFit === 'cover' ? 'object-cover' : 'object-contain'
                } ${
                  activePlayer === 'A' ? 'video-active' : 'video-inactive'
                }`
              : `absolute inset-0 w-full h-full object-contain cursor-pointer ${
                  activePlayer === 'A' ? 'video-active' : 'video-inactive'
                }`
          }
          playsInline
          onClick={togglePlay}
        />
        <video
          ref={videoRefB}
          id="player-b"
          className={
            isCinemaBackdrop
              ? `absolute inset-0 w-full h-full cursor-pointer ${
                  videoFit === 'cover' ? 'object-cover' : 'object-contain'
                } ${
                  activePlayer === 'B' ? 'video-active' : 'video-inactive'
                }`
              : `absolute inset-0 w-full h-full object-contain cursor-pointer ${
                  activePlayer === 'B' ? 'video-active' : 'video-inactive'
                }`
          }
          playsInline
          onClick={togglePlay}
        />
      </div>

      {/* Subtitles Overlay */}
      {subtitlesEnabled && currentSubtitleText && (
        <div
          id="custom-subtitles-overlay"
          className="absolute bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 text-center pointer-events-none z-15 select-none w-[90%] max-w-2xl px-4 py-2 bg-black/85 backdrop-blur-md rounded-lg border border-white/10 shadow-2xl transition-all duration-150"
        >
          <p className="text-white text-xs sm:text-sm md:text-base font-medium tracking-wide leading-relaxed filter drop-shadow-[0_2px_2px_rgba(0,0,0,1)] whitespace-pre-line">
            {currentSubtitleText}
          </p>
        </div>
      )}

      {/* Floating Mute Notification */}
      {isMuted && hasUserInteracted && !isSplashActive && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleMute();
          }}
          className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-purple-600/90 hover:bg-purple-500 backdrop-blur-md text-white text-[10px] font-black tracking-widest px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 border border-purple-400/20 cursor-pointer pointer-events-auto transition-all duration-300 scale-100 uppercase"
        >
          <VolumeX className="w-3.5 h-3.5 text-white animate-pulse" />
          <span>MUTED BROADCAST • TAP TO UNMUTE</span>
        </button>
      )}

      {/* Layer 0.5: Buffer Spinner Overlay (during latency stalls) */}
      {hasUserInteracted && !isSplashActive && (playbackState === 'loading' || playbackState === 'stalled') && (
        <div className="absolute inset-0 z-12 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] pointer-events-none">
          <div className="flex flex-col items-center gap-3 p-4 bg-black/80 border border-white/10 rounded-2xl shadow-2xl">
            {/* Subtle elegant circular spinner */}
            <div className="relative w-10 h-10">
              {/* Outer track */}
              <div className="absolute inset-0 rounded-full border-2 border-white/5" />
              {/* Spinning arc */}
              <div className="absolute inset-0 rounded-full border-2 border-t-[#8c5cd0] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-[10px] font-mono font-black text-white uppercase tracking-widest animate-pulse">
                Buffering Stream
              </p>
              <p className="text-[9px] font-mono text-white/40 mt-0.5 uppercase tracking-wider">
                Awaiting Stream Packets...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Layer 1: Branding Splash Layer (Autoplay muted loop concept, blur(1rem) transition) */}
      <div
        id="video-logo"
        className={`absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0a0a0a]/95 transition-all duration-700 pointer-events-none ${
          isSplashActive ? 'opacity-100 backdrop-blur-md scale-100' : 'opacity-0 scale-95'
        } ${isSplashFullyHidden ? 'hidden' : ''}`}
      >
        {/* Generous blur backdrop background elements */}
        <div className="absolute inset-0 bg-radial from-[#8c5cd0]/10 via-transparent to-transparent opacity-60 animate-pulse pointer-events-none" />

        {/* Branding graphics card */}
        <div className="text-center relative z-20 px-6 py-8 rounded-lg max-w-md bg-[#111111] border border-white/5 shadow-2xl">
          <div className="inline-flex items-center justify-center p-3 bg-black border border-[#8c5cd0]/30 rounded-full mb-4 animate-bounce">
            <Radio className="w-8 h-8 text-[#8c5cd0]" />
          </div>
          <h2 className="text-lg font-bold tracking-tight text-white font-sans uppercase">
            {channelName}
          </h2>
          <p className="text-[10px] text-white/40 mt-1 font-mono uppercase tracking-widest">
            {isLiveMode ? 'SYNCING VIRTUAL BROADCAST' : 'BUFFERING ON DEMAND SOURCE'}
          </p>

          <div className="mt-6 flex flex-col items-center justify-center">
            {playbackState === 'loading' && (
              <div className="flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 text-[#8c5cd0] animate-spin" />
                <span className="text-[10px] text-white/30 font-mono tracking-widest uppercase">
                  Decoding stream segments...
                </span>
              </div>
            )}
            {playbackState === 'error' && (
              <div className="flex flex-col items-center gap-2 text-red-500">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="text-[10px] font-mono uppercase tracking-wide">Decoder Stall. Click to retry.</span>
              </div>
            )}

            {!hasUserInteracted && (
              <button
                onClick={startStream}
                id="btn-play-stream"
                className="mt-2 px-5 py-2 bg-[#8c5cd0] text-white text-[11px] font-bold rounded-full hover:bg-purple-600 transition-all shadow-lg hover:shadow-purple-500/20 active:scale-95 flex items-center gap-1.5 cursor-pointer pointer-events-auto uppercase tracking-wider"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>START BROADCAST</span>
              </button>
            )}
          </div>
        </div>

        {/* Small subtitle details to mimic real professional TV Guide templates */}
        <div className="absolute bottom-6 left-6 text-left">
          <div className="text-white/20 font-mono text-[9px] uppercase tracking-widest">DIAGNOSTICS SECURE</div>
          <div className="text-white/60 text-xs font-medium font-sans">
            Now Scheduling: <span className="text-[#8c5cd0]">{show.title}</span>
          </div>
        </div>
      </div>

      {/* Layer 2: Top Status Rail Overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/90 to-transparent flex items-center justify-between pointer-events-none z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 hidden group-hover:flex">
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 text-[10px] bg-red-600 text-white rounded font-bold tracking-wider animate-pulse flex items-center gap-1 uppercase">
            <Radio className="w-2.5 h-2.5" />
            {isLiveMode ? 'LIVE' : 'VOD'}
          </span>
          <div className="text-left">
            <h3 className="text-xs font-bold text-white tracking-tight">{show.title}</h3>
            <p className="text-[10px] text-white/75 font-sans">
              S{episode.season || '01'} EP{episode.episodeNumber || '01'} • {episode.title}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onEditChannel && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditChannel();
              }}
              className="px-2.5 py-1 text-[10px] font-mono text-purple-300 bg-purple-950/60 hover:bg-purple-900 border border-purple-500/40 rounded flex items-center gap-1.5 transition-all cursor-pointer pointer-events-auto"
              title="Edit Station Titles & Stream URL"
            >
              <Edit3 className="w-3 h-3 text-purple-400" />
              <span>EDIT STATION</span>
            </button>
          )}
          <div className="text-right text-[10px] font-mono text-[#8c5cd0] bg-black/50 px-2.5 py-1 border border-white/5 rounded uppercase tracking-wider">
            {channelName}
          </div>
        </div>
      </div>

      {/* Layer 2: Custom controls bar ("sc-controls-bar") */}
      <div
        id="sc-controls-bar"
        className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/95 via-black/80 to-transparent z-20 flex flex-col gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 hidden group-hover:flex"
      >
        {/* Timeline Progress Slider */}
        <div className="flex items-center gap-3 w-full">
          <span className="text-[10px] font-mono text-white/50 shrink-0 select-none">
            {formatTime(currentTime)}
          </span>
          
          <div className="relative flex-1 group/slider h-5 flex items-center">
            {/* Custom Buffer Track background */}
            <div className="absolute left-0 right-0 h-1 bg-white/10 rounded-full overflow-hidden">
              {/* Buffer Bar */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-white/20 rounded-full transition-all duration-300"
                style={{ width: `${bufferedPercent}%` }}
              />
              {/* Active Play progress bar */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-[#8c5cd0]"
                style={{ width: `${currentPercent}%` }}
              />
            </div>

            {/* Input range overlay */}
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.1"
              value={currentTime}
              onChange={handleScrub}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              title="Seek stream Timeline"
              id="slider-timeline"
            />

            {/* Slider Seek Handle dot indicator */}
            <div
              className="absolute w-2.5 h-2.5 bg-white rounded-full shadow border border-[#8c5cd0] -ml-1 pointer-events-none transition-transform group-hover/slider:scale-125"
              style={{ left: `${currentPercent}%` }}
            />
          </div>

          <span className="text-[10px] font-mono text-white/50 shrink-0 select-none">
            {formatTime(duration)}
          </span>
        </div>

        {/* Lower Row Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Play/Pause Button */}
            <button
              onClick={togglePlay}
              className="p-1 text-white/70 hover:text-white rounded-full hover:bg-white/5 transition-all cursor-pointer active:scale-90"
              title={isPlaying ? 'Pause Show' : 'Play Show'}
              id="btn-toggle-play"
            >
              {isPlaying ? (
                <Pause className="w-4.5 h-4.5 fill-current" />
              ) : (
                <Play className="w-4.5 h-4.5 fill-current" />
              )}
            </button>

            {/* Sound Button */}
            <div className="flex items-center gap-2 group/volume">
              <button
                onClick={toggleMute}
                className="p-1 text-white/70 hover:text-white rounded-full hover:bg-white/5 transition-all cursor-pointer active:scale-90"
                title={isMuted ? 'Unmute Show' : 'Mute Show'}
                id="btn-toggle-mute"
              >
                {isMuted ? (
                  <VolumeX className="w-4.5 h-4.5 text-red-500" />
                ) : volume < 0.3 ? (
                  <Volume1 className="w-4.5 h-4.5" />
                ) : (
                  <Volume2 className="w-4.5 h-4.5" />
                )}
              </button>

              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-14 h-0.5 bg-white/20 rounded-full appearance-none cursor-pointer accent-[#8c5cd0] opacity-0 group-hover/volume:opacity-100 transition-opacity duration-300"
                title="Adjust Audio Volume"
                id="slider-volume"
              />
            </div>

            {/* Live Indicator Badges */}
            {isLiveMode ? (
              <span className="px-2 py-0.5 rounded bg-red-950 border border-red-500/20 text-[9px] font-mono text-red-400 flex items-center gap-1 select-none">
                <span className="w-1 h-1 rounded-full bg-red-500 animate-ping" />
                LIVE SYNC
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5 text-[9px] font-mono text-[#a855f7] flex items-center gap-1 select-none">
                <HardDriveDownload className="w-2.5 h-2.5" />
                VOD MODE
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-white/50">
            {/* Resolution indicator */}
            <span className="text-[9px] border border-white/10 px-1.5 py-0.5 rounded select-none text-white/40 uppercase font-mono tracking-wider">
              1080p
            </span>

            {/* Subtitles (Closed Captions CC) Button */}
            {episode.subtitleUrl && (
              <button
                onClick={() => {
                  setSubtitlesEnabled(!subtitlesEnabled);
                  onLogEvent('custom', `Closed captions toggled ${!subtitlesEnabled ? 'ON' : 'OFF'}`);
                }}
                className={`p-1 rounded hover:bg-white/5 transition-all cursor-pointer active:scale-90 flex items-center justify-center ${
                  subtitlesEnabled ? 'text-[#a855f7] font-bold' : 'text-white/40 hover:text-white/70'
                }`}
                title={subtitlesEnabled ? 'Disable Closed Captions (CC)' : 'Enable Closed Captions (CC)'}
                aria-label="Toggle Closed Captions"
                id="btn-subtitles-toggle"
              >
                <Subtitles className="w-4 h-4" />
                <span className="text-[9px] font-black ml-0.5 tracking-tighter">CC</span>
              </button>
            )}

            {/* Accessibility Info Overlay Button */}
            <button
              onClick={() => {
                setShowOverlay(!showOverlay);
                onLogEvent('custom', `Accessibility overlay toggled ${!showOverlay ? 'ON' : 'OFF'}`);
              }}
              className={`p-1 rounded-full hover:bg-white/5 transition-all cursor-pointer active:scale-90 ${
                showOverlay ? 'text-purple-400 font-bold' : 'text-white/70 hover:text-white'
              }`}
              title="Toggle Accessibility Info Panel (Press O)"
              aria-label="Toggle Accessibility Metadata Overlay"
              aria-expanded={showOverlay}
              id="btn-accessibility-overlay"
            >
              <Info className="w-4 h-4" />
            </button>

            {/* Picture-in-Picture Button */}
            <button
              onClick={togglePictureInPicture}
              className={`p-1 rounded-full hover:bg-white/5 transition-all cursor-pointer active:scale-90 ${
                isPipActive ? 'text-purple-400 font-bold' : 'text-white/70 hover:text-white'
              }`}
              title={isPipActive ? 'Exit Picture-in-Picture' : 'Enter Picture-in-Picture'}
              id="btn-pip"
            >
              <PictureInPicture className="w-4 h-4" />
            </button>

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="p-1 text-white/70 hover:text-white rounded-full hover:bg-white/5 transition-all cursor-pointer active:scale-90"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              id="btn-fullscreen"
            >
              {isFullscreen ? (
                <Minimize className="w-4 h-4" />
              ) : (
                <Maximize className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Layer 5: Accessibility EPG Metadata & Cast Overlay (ARIA-style panel) */}
      <div
        role="region"
        aria-label="EPG Metadata and Cast Overlay"
        aria-hidden={!showOverlay}
        id="accessibility-overlay"
        className={`absolute inset-x-0 bottom-12 bg-[#09090b]/95 backdrop-blur-md border-t border-white/10 p-5 z-25 transition-all duration-300 flex flex-col gap-4 text-left select-text ${
          showOverlay ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
        }`}
        style={{ maxHeight: '70%' }}
      >
        {/* Title and Close Row */}
        <div className="flex items-start justify-between border-b border-white/5 pb-3">
          <div>
            <span className="text-[9px] font-mono font-black tracking-widest text-[#a855f7] uppercase bg-[#a855f7]/10 px-2 py-0.5 rounded border border-[#a855f7]/20">
              ACCESSIBLE SCREEN READER / METADATA ENGINES
            </span>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-sans mt-1.5 flex items-center gap-2">
              {show.title}
              <span className="text-xs text-white/40 font-mono font-medium lowercase">
                S{episode.season || '01'} EP{episode.episodeNumber || '01'}
              </span>
            </h3>
            <h4 className="text-xs font-semibold text-white/80 mt-1 font-sans">
              {episode.title}
            </h4>
          </div>
          <button
            onClick={() => setShowOverlay(false)}
            className="p-1 text-white/50 hover:text-white hover:bg-white/5 rounded-full transition-colors cursor-pointer"
            aria-label="Close accessibility metadata panel"
            id="close-accessibility-overlay"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 overflow-y-auto pr-1 scrollbar-none">
          {/* Column 1: Plot & Trivia */}
          <div className="md:col-span-2 space-y-4">
            <div>
              <h5 className="text-[9px] font-mono font-bold text-white/40 uppercase tracking-wider">
                Plot Summary
              </h5>
              <p className="text-xs text-white/70 font-sans leading-relaxed mt-1">
                {show.description || "No description loaded."}
              </p>
            </div>

            {/* Did You Know? / Fun Facts */}
            <div className="p-3 bg-purple-950/20 border border-purple-500/10 rounded-xl flex gap-3">
              <Sparkles className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <h5 className="text-[9px] font-mono font-bold text-purple-300 uppercase tracking-wider">
                  Did You Know? (Trivia)
                </h5>
                <p className="text-xs text-white/80 font-sans leading-relaxed mt-1 italic">
                  {episode.funFact || "Filming was done entirely with vintage cameras to preserve the classic film-grain look and historical realism."}
                </p>
              </div>
            </div>
          </div>

          {/* Column 2: Specs & Cast list */}
          <div className="space-y-4 border-l border-white/5 pl-0 md:pl-4">
            {/* Run Specs */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2.5 bg-white/2 border border-white/5 rounded-lg">
                <div className="flex items-center gap-1.5 text-[9px] font-mono text-white/30 uppercase tracking-wider">
                  <Clock className="w-3.5 h-3.5 text-[#a855f7]" />
                  <span>Runtime</span>
                </div>
                <p className="text-xs font-bold text-white mt-1">
                  {episode.runtimeMins || 30} mins
                </p>
              </div>
              <div className="p-2.5 bg-white/2 border border-white/5 rounded-lg">
                <div className="flex items-center gap-1.5 text-[9px] font-mono text-white/30 uppercase tracking-wider">
                  <Database className="w-3.5 h-3.5 text-[#a855f7]" />
                  <span>Est. Size</span>
                </div>
                <p className="text-xs font-bold text-white mt-1">
                  {episode.estimatedSizeGb || 0.45} GB
                </p>
              </div>
            </div>

            {/* Netflix-style Cast Cards */}
            <div>
              <h5 className="text-[9px] font-mono font-bold text-white/40 uppercase tracking-wider mb-2">
                Cast & Characters
              </h5>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {(show.cast || [
                  { name: 'Richard Boone', character: 'Paladin', bio: 'The cultured, black-clad gentleman gunfighter of San Francisco.', imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop&crop=face' },
                  { name: 'James Garner', character: 'Bret Maverick', bio: 'The smooth, charismatic poker player of the old West.', imageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&h=120&fit=crop&crop=face' },
                  { name: 'Rod Serling', character: 'The Narrator', bio: 'The legendary playwright guiding us through the Zone.', imageUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&h=120&fit=crop&crop=face' }
                ]).map((actor, aIdx) => (
                  <div key={aIdx} className="flex gap-2.5 p-1.5 bg-white/3 border border-white/5 rounded-lg items-center hover:bg-white/5 transition-colors">
                    <img
                      src={actor.imageUrl}
                      alt={actor.name}
                      referrerPolicy="no-referrer"
                      className="w-8 h-8 rounded-full object-cover shrink-0 border border-white/10"
                    />
                    <div className="min-w-0 text-[10px]">
                      <div className="font-bold text-white truncate">{actor.name}</div>
                      <div className="text-[#a855f7] font-mono uppercase tracking-widest text-[8px] truncate">as {actor.character}</div>
                      <div className="text-white/40 truncate text-[9px] mt-0.5 leading-none max-w-[200px]">{actor.bio}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
