/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { PlaybackLog } from '../types';
import { Terminal, Trash2, ShieldCheck, Activity } from 'lucide-react';

interface DiagnosticConsoleProps {
  logs: PlaybackLog[];
  onClearLogs: () => void;
}

export function DiagnosticConsole({ logs, onClearLogs }: DiagnosticConsoleProps) {
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Keep console scrolled to the bottom
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div id="diagnostic-console" className="hidden bg-[#0a0a0a] border border-white/10 rounded-lg p-4 font-mono text-[11px] text-gray-300 flex flex-col h-full min-h-[280px]">
      {/* Console Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3">
        <div className="flex items-center gap-2 text-white/80">
          <Terminal className="w-3.5 h-3.5 text-[#8c5cd0]" />
          <span className="font-semibold tracking-wider text-[10px] text-[#8c5cd0] uppercase">STREAM MONITOR</span>
          <span className="px-2 py-0.5 text-[9px] bg-white/5 border border-white/5 rounded-full text-white/50 flex items-center gap-1 font-mono">
            <Activity className="w-2.5 h-2.5 text-red-500 animate-pulse" />
            Live Logs
          </span>
        </div>
        <button
          onClick={onClearLogs}
          className="text-white/40 hover:text-red-400 p-1 rounded hover:bg-white/5 transition-colors flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider cursor-pointer"
          title="Clear Diagnostic Log"
          id="btn-clear-logs"
        >
          <Trash2 className="w-3 h-3" />
          <span>Clear</span>
        </button>
      </div>

      {/* Terminal Output */}
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-2 scrollbar-thin scrollbar-thumb-white/10 text-[10px] leading-relaxed">
        {logs.length === 0 ? (
          <div className="text-white/30 flex flex-col items-center justify-center h-full gap-2 font-mono py-8">
            <ShieldCheck className="w-6 h-6 text-white/10" />
            <p className="text-center text-[10px] tracking-tight">System idle. Routing signals recorded here...</p>
          </div>
        ) : (
          logs.map((log) => {
            let labelColor = 'text-green-400';
            if (log.type === 'error') labelColor = 'text-red-400 font-bold';
            if (log.type === 'waiting' || log.type === 'stalled') labelColor = 'text-amber-400';
            if (log.type === 'epg') labelColor = 'text-[#8c5cd0]';

            return (
              <div key={log.id} className="leading-relaxed hover:bg-white/5 p-0.5 rounded transition-colors flex gap-2">
                <span className="text-white/20 select-none shrink-0">{log.timestamp}</span>
                <span className={`${labelColor} break-all`}>
                  {log.message}
                  {log.meta && (
                    <span className="text-white/40 text-[9px] ml-1.5 font-mono">
                      ({log.meta.time !== undefined && `t:${log.meta.time.toFixed(1)}s`}
                      {log.meta.buffered !== undefined && ` | buf:${log.meta.buffered.toFixed(1)}s`}
                      {log.meta.readyState !== undefined && ` | rs:${log.meta.readyState}`}
                      )
                    </span>
                  )}
                </span>
              </div>
            );
          })
        )}
        <div ref={terminalEndRef} />
      </div>

      {/* Telemetry Footer */}
      <div className="mt-2 pt-2 border-t border-white/5 flex justify-between text-[9px] text-white/30">
        <span>UTC CLOCK MONITOR</span>
        <span>PROTOCOL v2.4.1</span>
      </div>
    </div>
  );
}
