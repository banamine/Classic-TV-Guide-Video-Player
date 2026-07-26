import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';

export interface CustomVideoPlayerProps {
  streamUrl: string;
  onEnded?: () => void;
  onError?: (error: Error | string) => void;
}

export const CustomVideoPlayer: React.FC<CustomVideoPlayerProps> = ({
  streamUrl,
  onEnded,
  onError,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Track all active event listeners for clean teardown
  const listenersRef = useRef<Array<{ target: EventTarget; type: string; handler: EventListener }>>([]);

  const addTrackedListener = (target: EventTarget, type: string, handler: EventListener) => {
    target.addEventListener(type, handler);
    listenersRef.current.push({ target, type, handler });
  };

  const removeAllListeners = () => {
    listenersRef.current.forEach(({ target, type, handler }) => {
      target.removeEventListener(type, handler);
    });
    listenersRef.current = [];
  };

  const teardownPlayer = () => {
    // 1. Clean up attached native DOM listeners
    removeAllListeners();

    // 2. Destroy active HLS instance if present
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // 3. Reset HTML5 video element with ref guard
    const video = videoRef.current;
    if (!video) return;

    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch (err) {
      console.warn('Playback teardown interrupted:', err);
    }
  };

  useEffect(() => {
    // Always teardown existing stream/listeners before loading new stream
    teardownPlayer();

    const video = videoRef.current;
    if (!video || !streamUrl) return;

    // HLS Stream (.m3u8) handling
    if (Hls.isSupported() && streamUrl.endsWith('.m3u8')) {
      const hls = new Hls({
        manifestLoadingTimeOut: 7000,
        manifestLoadingMaxRetry: 2,
        enableWorker: true,
      });

      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!videoRef.current) return;
        videoRef.current.play().catch((err) => {
          console.warn('Autoplay prevented or interrupted:', err);
        });
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          onError?.(`HLS Fatal Error: ${data.details}`);
        }
      });
    } else {
      // Native MP4 / Direct Stream handling
      video.src = streamUrl;

      const onCanPlay = () => {
        if (!videoRef.current) return;
        videoRef.current.play().catch((err) => console.warn('Autoplay prevented:', err));
      };

      const handleVideoError = () => {
        onError?.('Native video playback error occurred');
      };

      addTrackedListener(video, 'canplay', onCanPlay as EventListener);
      addTrackedListener(video, 'error', handleVideoError as EventListener);

      if (onEnded) {
        addTrackedListener(video, 'ended', onEnded as EventListener);
      }

      video.load();
    }

    return () => {
      teardownPlayer();
    };
  }, [streamUrl]);

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        controls
        playsInline
      />
    </div>
  );
};
