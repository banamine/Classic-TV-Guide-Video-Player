/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Channel, Show, Episode } from '../types';
import { X, Tv, Save, Link as LinkIcon, Edit3, Tag, Layers, Sparkles, Check, Loader2 } from 'lucide-react';
import { fetchAndParseJsonPlaylist } from '../utils/m3uParser';

interface StationEditModalProps {
  channel: Channel | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedChannel: Channel) => Promise<void>;
  categories: string[];
}

export function StationEditModal({
  channel,
  isOpen,
  onClose,
  onSave,
  categories,
}: StationEditModalProps) {
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [showTitle, setShowTitle] = useState('');
  const [episodeTitle, setEpisodeTitle] = useState('');
  const [url, setUrl] = useState('');
  const [tags, setTags] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if (channel) {
      setNumber(channel.number || '');
      setName(channel.name || '');
      setCategory(channel.category || 'User Stations');
      setShowTitle(channel.shows?.[0]?.title || channel.name || 'Live Show');
      setEpisodeTitle(channel.shows?.[0]?.episodes?.[0]?.title || 'Live Stream');
      
      const currentUrl = channel.url || channel.shows?.[0]?.episodes?.[0]?.url || '';
      setUrl(currentUrl);

      const tagParts = Object.entries(channel.customTags || {})
        .map(([k, v]) => (v === 'true' ? k : `${k}=${v}`))
        .join(', ');
      setTags(tagParts);
      setStatusMsg('');
    }
  }, [channel, isOpen]);

  if (!isOpen || !channel) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMsg('Saving changes...');

    try {
      const updated: Channel = { ...channel };
      updated.number = number.trim() || channel.number;
      updated.name = name.trim() || channel.name;
      updated.category = category.trim() || channel.category || 'User Stations';

      // Parse custom tags string
      const parsedTags: Record<string, string> = {};
      if (tags.trim()) {
        tags.split(',').forEach((part) => {
          const trimmed = part.trim();
          if (!trimmed) return;
          const eqIdx = trimmed.indexOf('=');
          const colIdx = trimmed.indexOf(':');
          const splitIdx = eqIdx !== -1 ? eqIdx : colIdx;
          if (splitIdx !== -1) {
            const k = trimmed.substring(0, splitIdx).trim();
            const v = trimmed.substring(splitIdx + 1).trim();
            if (k) parsedTags[k] = v;
          } else {
            parsedTags[trimmed] = 'true';
          }
        });
      }
      updated.customTags = parsedTags;

      const trimmedUrl = url.trim();

      // Check if URL is a JSON playlist file (e.g. https://archive.org/download/daily-highlights/WORLD%20WARS.json)
      if (trimmedUrl.toLowerCase().includes('.json')) {
        setStatusMsg('Fetching and parsing JSON playlist file...');
        try {
          const parsed = await fetchAndParseJsonPlaylist(trimmedUrl, updated.name);
          if (parsed.shows && parsed.shows.length > 0) {
            updated.shows = parsed.shows;
            updated.url = parsed.firstVideoUrl || trimmedUrl;
            if (parsed.extractedName && (updated.name.startsWith('Custom Station') || !updated.name)) {
              updated.name = parsed.extractedName;
            }
            setStatusMsg(`Successfully loaded ${parsed.shows.length} show(s) from JSON file!`);
          } else {
            updated.url = trimmedUrl;
          }
        } catch (jsonErr: any) {
          console.warn('JSON parsing error, falling back to direct URL:', jsonErr);
          setStatusMsg(`JSON note: ${jsonErr.message}. Saved URL as direct link.`);
          updated.url = trimmedUrl;
        }
      } else {
        updated.url = trimmedUrl;
        
        // Update show and episode titles
        if (!updated.shows || updated.shows.length === 0) {
          updated.shows = [
            {
              id: `show-${updated.id}`,
              title: showTitle.trim() || updated.name,
              description: 'Custom Channel Broadcast',
              year: '2026',
              genre: updated.category,
              episodes: [
                {
                  id: `ep-${updated.id}`,
                  title: episodeTitle.trim() || updated.name,
                  url: trimmedUrl,
                  durationMs: 86400000,
                  runtimeMins: 1440
                }
              ]
            }
          ];
        } else {
          updated.shows = updated.shows.map((s, sIdx) => {
            if (sIdx === 0) {
              return {
                ...s,
                title: showTitle.trim() || s.title,
                episodes: (s.episodes || []).map((ep, epIdx) => {
                  if (epIdx === 0) {
                    return {
                      ...ep,
                      title: episodeTitle.trim() || ep.title,
                      url: trimmedUrl || ep.url
                    };
                  }
                  return ep;
                })
              };
            }
            return s;
          });
        }
      }

      await onSave(updated);
      setIsSaving(false);
      onClose();
    } catch (err: any) {
      console.error('Failed to save channel:', err);
      setStatusMsg(`Error: ${err.message}`);
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg bg-[#11131f] border border-purple-500/30 rounded-2xl shadow-2xl overflow-hidden font-sans text-white">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-purple-500/20 border border-purple-500/40 rounded-lg text-purple-400">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-wide uppercase font-sans">
                Station & Title Editor
              </h3>
              <p className="text-[11px] text-white/50 font-mono">
                Channel #{channel.number} • {channel.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {statusMsg && (
            <div className="p-2.5 bg-purple-950/40 border border-purple-500/30 rounded-lg text-xs text-purple-300 font-mono flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            {/* Channel Number */}
            <div className="col-span-1">
              <label className="block text-[11px] font-mono text-white/60 mb-1">
                CH #
              </label>
              <input
                type="text"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Channel Name */}
            <div className="col-span-2">
              <label className="block text-[11px] font-mono text-white/60 mb-1">
                Channel Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. World Wars Channel"
                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-xs text-white font-semibold focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Show Title / Now Playing */}
            <div>
              <label className="block text-[11px] font-mono text-white/60 mb-1">
                Show Title (Now Playing)
              </label>
              <input
                type="text"
                value={showTitle}
                onChange={(e) => setShowTitle(e.target.value)}
                placeholder="e.g. World Wars"
                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Episode Title */}
            <div>
              <label className="block text-[11px] font-mono text-white/60 mb-1">
                Episode Title
              </label>
              <input
                type="text"
                value={episodeTitle}
                onChange={(e) => setEpisodeTitle(e.target.value)}
                placeholder="e.g. Episode 1: Dawn of Conflict"
                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Category / Group */}
          <div>
            <label className="block text-[11px] font-mono text-white/60 mb-1">
              Group / Category
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. User Stations, Documentaries"
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-xs text-purple-300 font-medium focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Stream Direct URL or JSON file link */}
          <div>
            <label className="block text-[11px] font-mono text-white/60 mb-1 flex items-center justify-between">
              <span>Stream Direct URL / JSON Playlist Link</span>
              <span className="text-[9px] text-purple-400 font-normal">
                (.mp4, .m3u8, or .json link supported)
              </span>
            </label>
            <div className="relative">
              <LinkIcon className="absolute left-3 top-2.5 w-3.5 h-3.5 text-white/40" />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://archive.org/download/daily-highlights/WORLD%20WARS.json"
                className="w-full bg-white/5 border border-white/15 rounded-lg py-2 pl-9 pr-3 text-xs font-mono text-white/90 focus:outline-none focus:border-purple-500"
              />
            </div>
            <p className="text-[10px] text-white/40 mt-1 font-mono">
              Paste a direct video stream (.mp4/.m3u8) or JSON playlist URL (e.g. archive.org .json file).
            </p>
          </div>

          {/* Custom Tags */}
          <div>
            <label className="block text-[11px] font-mono text-white/60 mb-1">
              Custom Tags
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. hd, lang=en, archive"
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-xs font-mono text-white/80 focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Modal Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-lg shadow-purple-600/30 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Station & Re-Tune</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
