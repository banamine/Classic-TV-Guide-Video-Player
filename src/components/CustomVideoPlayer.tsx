/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { PlaybackLog, Episode, Show } from '../types';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Volume1, AlertCircle, RefreshCw, Radio, HardDriveDownload, PictureInPicture } from 'lucide-react';

interface CustomVideoPlayerProps {
  episode: Episode;
  show: Show;
  channelName: string;
  isLiveMode: boolean;
  liveSeekOffset: number;
  onLogEvent: (type: PlaybackLog['type'], message: string, meta?: PlaybackLog['meta']) => void;
}

export function CustomVideoPlayer({
  episode,
  show,
  channelName,
  isLiveMode,
  liveSeekOffset,
  onLogEvent,
}: CustomVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
    const video = videoRef.current;
    if (!video) return;

    const handleEnterPip = () => {
      setIsPipActive(true);
      onLogEvent('custom', `Picture-in-Picture mode started`);
    };
    const handleLeavePip = () => {
      setIsPipActive(false);
      onLogEvent('custom', `Picture-in-Picture mode stopped`);
    };

    video.addEventListener('enterpictureinpicture', handleEnterPip);
    video.addEventListener('leavepictureinpicture', handleLeavePip);

    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnterPip);
      video.removeEventListener('leavepictureinpicture', handleLeavePip);
    };
  }, [hasUserInteracted]);

  // Restart video when the selected episode changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setIsSplashActive(true);
    setIsSplashFullyHidden(false);
    setPlaybackState('loading');
    video.src = episode.url;
    video.load();

    onLogEvent('custom', `Initializing video stream for ${show.title} - S${episode.season || '01'}E${episode.episodeNumber || '01'}: ${episode.title}`, {
      channelId: episode.id,
      episodeId: episode.id,
    });
  }, [episode.url]);

  // Adjust live seek offset if in Live Broadcast mode
  const handleCanPlay = () => {
    const video = videoRef.current;
    if (!video) return;

    // Play if the user has already interacted, to satisfy browser autoplay security policies
    if (hasUserInteracted) {
      video.play().catch(() => {});
    }
  };

  // Set up telemetry diagnostic event listeners on mounting
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlaying = () => {
      setIsPlaying(true);
      setPlaybackState('playing');
      onLogEvent('playing', `[Playback Health]: Stream active`, {
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
      setIsSplashActive(true); // Bring up blur placeholder on stream stalls
      setIsSplashFullyHidden(false);
      console.warn(`[Playback Health]: waiting`, {
        currentTime: video.currentTime,
        bufferEnd: video.buffered.length ? video.buffered.end(0) : 0,
        networkState: video.networkState
      });
      onLogEvent('waiting', `[Playback Health]: Buffering stream / seeking packet blocks`, {
        time: video.currentTime,
        buffered: getBufferRange(video),
        readyState: video.readyState,
      });
    };

    const onStalled = () => {
      setPlaybackState('stalled');
      setIsSplashActive(true); // Bring up blur placeholder on stream stalls
      setIsSplashFullyHidden(false);
      console.warn(`[Playback Health]: stalled`, {
        currentTime: video.currentTime,
        bufferEnd: video.buffered.length ? video.buffered.end(0) : 0,
        networkState: video.networkState
      });
      onLogEvent('stalled', `[Playback Health]: Buffer stalled, awaiting network segments`, {
        time: video.currentTime,
        buffered: getBufferRange(video),
        readyState: video.readyState,
      });
    };

    const onError = () => {
      setPlaybackState('error');
      setIsSplashActive(true); // Bring up blur placeholder on stream stalls
      setIsSplashFullyHidden(false);
      console.warn(`[Playback Health]: error`, {
        currentTime: video.currentTime,
        bufferEnd: video.buffered.length ? video.buffered.end(0) : 0,
        networkState: video.networkState
      });
      onLogEvent('error', `[Playback Health]: Stream decode error or resource missing at source`, {
        time: video.currentTime,
        buffered: getBufferRange(video),
        readyState: video.readyState,
      });
    };

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      setBufferedEnd(getBufferRange(video));
    };

    const onDurationChange = () => {
      setDuration(video.duration || 0);
    };

    // Bind listeners
    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('stalled', onStalled);
    video.addEventListener('error', onError);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('canplay', handleCanPlay);

    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('stalled', onStalled);
      video.removeEventListener('error', onError);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('canplay', handleCanPlay);
    };
  }, [episode.url, isLiveMode, liveSeekOffset, hasUserInteracted]);

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

  // User trigger to initiate initial play
  const startStream = () => {
    const video = videoRef.current;
    if (!video) return;
    setHasUserInteracted(true);
    video.play().catch(() => {});
    onLogEvent('custom', `User clicked start stream command`);
  };

  const togglePlay = () => {
    const video = videoRef.current;
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
    if (videoRef.current) {
      videoRef.current.volume = value;
      videoRef.current.muted = value === 0;
    }
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (videoRef.current) {
      videoRef.current.muted = newMuted;
    }
    onLogEvent('custom', `Audio command: ${newMuted ? 'Muted' : 'Unmuted'}`);
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = parseFloat(e.target.value);
    setCurrentTime(targetTime);
    if (videoRef.current) {
      videoRef.current.currentTime = targetTime;
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
    const video = videoRef.current;
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
      id="custom-video-player"
      className="relative z-10 aspect-[4/3] max-w-5xl mx-auto w-full bg-black overflow-hidden border border-white/10 rounded-xl shadow-2xl group flex flex-col justify-between"
    >
      {/* Layer 0: Content Player HTML5 Element */}
      <video
        ref={videoRef}
        id="main-player"
        className="absolute inset-0 w-full h-full object-contain cursor-pointer"
        playsInline
        onClick={togglePlay}
      />

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
        <div className="text-right text-[10px] font-mono text-[#8c5cd0] bg-black/50 px-2.5 py-1 border border-white/5 rounded uppercase tracking-wider">
          {channelName}
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
    </div>
  );
}
