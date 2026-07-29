/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Tv, Sparkles, Sliders, RefreshCw, Film, Upload, Check, Play, Clock, Info, X } from 'lucide-react';
import { getFillerPool, setFillerPoolFromM3U, selectFillersForGap, FillerTrack, DEFAULT_COMMERCIAL_M3U } from '../utils/fillerManager';

interface CommercialFillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogEvent?: (type: 'epg' | 'custom', message: string) => void;
  onRefreshSchedule?: () => void;
}

export function CommercialFillModal({ isOpen, onClose, onLogEvent, onRefreshSchedule }: CommercialFillModalProps) {
  const [fillerTracks, setFillerTracks] = useState<FillerTrack[]>(() => getFillerPool());
  const [m3uInput, setM3uInput] = useState<string>(DEFAULT_COMMERCIAL_M3U);
  const [isEditingM3U, setIsEditingM3U] = useState<boolean>(false);
  const [testGapMins, setTestGapMins] = useState<number>(4);
  const [calculatedSequence, setCalculatedSequence] = useState<FillerTrack[]>(() => selectFillersForGap(4 * 60 * 1000));
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleUpdateM3U = () => {
    try {
      const updated = setFillerPoolFromM3U(m3uInput);
      setFillerTracks(updated);
      setIsEditingM3U(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      
      // Recalculate test gap sequence
      const newSeq = selectFillersForGap(testGapMins * 60 * 1000);
      setCalculatedSequence(newSeq);

      if (onLogEvent) {
        onLogEvent('custom', `Updated Commercial Filler Pool with ${updated.length} track items.`);
      }
      if (onRefreshSchedule) {
        onRefreshSchedule();
      }
    } catch (err: any) {
      alert(`Error parsing M3U: ${err.message}`);
    }
  };

  const handleResetDefault = () => {
    setM3uInput(DEFAULT_COMMERCIAL_M3U);
    const updated = setFillerPoolFromM3U(DEFAULT_COMMERCIAL_M3U);
    setFillerTracks(updated);
    setIsEditingM3U(false);
    const newSeq = selectFillersForGap(testGapMins * 60 * 1000);
    setCalculatedSequence(newSeq);
    if (onLogEvent) {
      onLogEvent('custom', 'Reset Commercial Filler Pool to default vintage commercials playlist.');
    }
    if (onRefreshSchedule) {
      onRefreshSchedule();
    }
  };

  const handleCalculateTestGap = (mins: number) => {
    setTestGapMins(mins);
    const seq = selectFillersForGap(mins * 60 * 1000);
    setCalculatedSequence(seq);
  };

  const totalPoolDurationSec = fillerTracks.reduce((acc, t) => acc + t.durationSec, 0);
  const totalPoolMins = Math.round(totalPoolDurationSec / 60);

  const testSeqDurationSec = calculatedSequence.reduce((acc, t) => acc + t.durationSec, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-[#111111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-8">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 bg-gradient-to-r from-purple-950/40 via-[#161618] to-amber-950/30 flex items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Tv className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-wide truncate">
                  Commercial & Interstitial Filler Engine
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase shrink-0">
                  ACTIVE • 30M GRID SYNC
                </span>
              </div>
              <p className="text-xs text-white/50 mt-0.5 break-words">
                Automated grid alignment algorithm plugging commercial breaks into dead air gaps.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">
          {/* Status summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-white/5 bg-white/2 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-white/40 font-mono">
                <span>COMMERCIAL POOL</span>
                <Film className="w-4 h-4 text-amber-400" />
              </div>
              <div className="mt-2">
                <span className="text-2xl font-black text-white font-mono">{fillerTracks.length}</span>
                <span className="text-xs text-white/40 ml-2">tracks available</span>
              </div>
              <span className="text-[10px] font-mono text-amber-400/80 mt-1">
                Total runtime: {totalPoolMins} mins
              </span>
            </div>

            <div className="p-4 rounded-xl border border-white/5 bg-white/2 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-white/40 font-mono">
                <span>GRID TARGET</span>
                <Clock className="w-4 h-4 text-purple-400" />
              </div>
              <div className="mt-2">
                <span className="text-2xl font-black text-white font-mono">30 / 60 MIN</span>
              </div>
              <span className="text-[10px] font-mono text-purple-400/80 mt-1">
                Standard broadcast boundaries
              </span>
            </div>

            <div className="p-4 rounded-xl border border-white/5 bg-white/2 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-white/40 font-mono">
                <span>FILL ALGORITHM</span>
                <Sparkles className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-2">
                <span className="text-sm font-bold text-emerald-400 font-mono">GREEDY KNAPSACK FIT</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400/80 mt-1">
                Gap = Target End - Show End
              </span>
            </div>
          </div>

          {/* Test Gap Calculator */}
          <div className="p-5 rounded-xl border border-white/10 bg-[#161618] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                  Interactive Gap Fill Simulator
                </h3>
              </div>
              <span className="text-xs text-white/40 font-mono">
                Target Gap: <strong className="text-amber-400">{testGapMins} Minutes</strong> ({testGapMins * 60}s)
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {[1, 2, 3, 4, 5, 8, 10].map((mins) => (
                <button
                  key={mins}
                  onClick={() => handleCalculateTestGap(mins)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                    testGapMins === mins
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow'
                      : 'bg-white/5 text-white/60 border-white/5 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {mins} min gap
                </button>
              ))}
            </div>

            {/* Simulated sequence output */}
            <div className="p-4 rounded-lg bg-black/60 border border-white/5 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-white/60">
                  Selected Interstitial Commercials ({calculatedSequence.length} items):
                </span>
                <span className="text-amber-400 font-bold">
                  Filled: {testSeqDurationSec}s / {testGapMins * 60}s target
                </span>
              </div>

              {calculatedSequence.length === 0 ? (
                <div className="text-xs font-mono text-white/30 text-center py-4">
                  No gap required or gap size too small for commercial fill.
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {calculatedSequence.map((track, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded bg-white/5 border border-white/5 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <div>
                          <p className="font-medium text-white/90">{track.title}</p>
                          <p className="text-[10px] font-mono text-white/40 truncate max-w-md">{track.url}</p>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-amber-300 bg-amber-950/40 border border-amber-500/20 px-2 py-0.5 rounded shrink-0">
                        {track.durationSec}s
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* M3U Playlist Editor / Inspector */}
          <div className="p-5 rounded-xl border border-white/10 bg-[#161618] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                  Commercial M3U Filler Playlist
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsEditingM3U(!isEditingM3U)}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 transition-all flex items-center gap-1.5"
                >
                  {isEditingM3U ? 'View Formatted List' : 'Edit M3U Text'}
                </button>
                <button
                  onClick={handleResetDefault}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-red-950/30 hover:bg-red-900/40 text-red-300 border border-red-500/20 transition-all flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reset to Default
                </button>
              </div>
            </div>

            {saveSuccess && (
              <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                Successfully updated Commercial Filler Pool with {fillerTracks.length} tracks! Broadcast schedules synchronized.
              </div>
            )}

            {isEditingM3U ? (
              <div className="space-y-3">
                <textarea
                  value={m3uInput}
                  onChange={(e) => setM3uInput(e.target.value)}
                  className="w-full h-64 p-3 rounded-lg bg-black/80 border border-white/10 font-mono text-xs text-white/90 focus:outline-none focus:border-purple-500/50 resize-y"
                  placeholder="#EXTM3U..."
                />
                <button
                  onClick={handleUpdateM3U}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-amber-600 hover:from-purple-500 hover:to-amber-500 text-white font-mono font-bold text-xs tracking-wider uppercase transition-all shadow-lg flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Save & Apply Commercial Playlist
                </button>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-black/40 border border-white/5 max-h-60 overflow-y-auto space-y-1.5">
                {fillerTracks.map((track, idx) => (
                  <div
                    key={track.id || idx}
                    className="p-2 rounded bg-white/2 hover:bg-white/5 border border-white/5 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5 truncate max-w-xl">
                      <span className="text-[10px] font-mono text-white/30">#{idx + 1}</span>
                      <span className="font-medium text-white/80 truncate">{track.title}</span>
                    </div>
                    <span className="text-[10px] font-mono text-amber-400/90 bg-amber-950/30 border border-amber-500/20 px-2 py-0.5 rounded shrink-0">
                      {track.durationSec}s
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-[#161618] flex items-center justify-between text-xs text-white/40 font-mono">
          <div className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-amber-400" />
            <span>Fillers auto-sync across Live & EPG views</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-mono font-bold transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
