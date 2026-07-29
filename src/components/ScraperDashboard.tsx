import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Cpu, 
  ShieldAlert, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Settings, 
  Terminal, 
  Database, 
  FileText, 
  Clock, 
  Sparkles, 
  Trash2,
  Calendar,
  Globe,
  Check,
  Radio,
  ChevronDown,
  ChevronUp,
  Filter,
  Search,
  SlidersHorizontal,
  FolderOpen,
  Film
} from 'lucide-react';
import { Channel } from '../types';

interface ScraperStatus {
  status: 'idle' | 'scraping' | 'enriching' | 'completed' | 'failed';
  progress: number;
  currentTask: string;
  lastRunTimestamp: string | null;
  logs: string[];
  cronSchedule: string;
  enrichWithGemini: boolean;
}

interface DBStats {
  queryCount: number;
  lastSeeded: string;
  dbFileSize: number;
  totalChannels: number;
  totalShows: number;
  totalEpisodes: number;
}

const DEFAULT_POOL_ITEMS = [
  {
    identifier: "s-01e-02.-point-blank",
    title: "Maverick S02e01 - The Day They Hanged Bret Maverick",
    description: "Bret Maverick is framed for a robbery and scheduled for the gallows. Can Bart Maverick save him in time?",
    subject: ["Western", "Comedy-Western", "Classic TV"],
    language: "English",
    creator: "nker150",
    downloads: 1250,
    format: "MPEG4 Video"
  },
  {
    identifier: "s-01.-e-17-ella-west.ia",
    title: "Have Gun - Will Travel: Three Bells To Perdido",
    description: "Paladin is hired to rescue a rancher's daughter from a bandit leader in Perdido, New Mexico.",
    subject: ["Western", "Action", "Classic TV"],
    language: "English",
    creator: "nker150",
    downloads: 980,
    format: "MPEG4 Video"
  },
  {
    identifier: "rawhide-3-x-30-incident-of-the-wager-on-payday",
    title: "Rawhide: Incident of the Wager on Payday",
    description: "Rowdy Yates is drawn into a high-stakes wager that puts the entire cattle drive in jeopardy.",
    subject: ["Western", "Drama", "Classic TV"],
    language: "English",
    creator: "nker150",
    downloads: 870,
    format: "MPEG4 Video"
  },
  {
    identifier: "death-valley-days-s-01-e-04-the-lost-pegleg-mine",
    title: "Death Valley Days: The Lost Pegleg Mine",
    description: "A historical re-enactment of the search for the legendary lost mine in the heart of Death Valley.",
    subject: ["Western", "Anthology", "History"],
    language: "English",
    creator: "nker150",
    downloads: 740,
    format: "MPEG4 Video"
  },
  {
    identifier: "the-lone-ranger-s01e01-enter-the-lone-ranger",
    title: "The Lone Ranger: Enter the Lone Ranger",
    description: "The origin story of the legendary masked rider of the plains and his faithful Indian companion, Tonto.",
    subject: ["Western", "Adventure", "Classic TV"],
    language: "English",
    creator: "nker150",
    downloads: 2450,
    format: "MPEG4 Video"
  },
  {
    identifier: "bonanza-s01e01-a-rose-for-lotta",
    title: "Bonanza: A Rose for Lotta",
    description: "The Cartwright family of the Ponderosa ranch must deal with an actress hired to lure Little Joe.",
    subject: ["Western", "Drama", "Classic TV"],
    language: "English",
    creator: "nker150",
    downloads: 3100,
    format: "MPEG4 Video"
  },
  {
    identifier: "cisco-kid-s01e01-boomerang",
    title: "The Cisco Kid: Boomerang",
    description: "The Cisco Kid and Pancho intervene when a greedy land-grabber frames a local homesteader.",
    subject: ["Western", "Adventure", "Classic TV"],
    language: "English",
    creator: "nker150",
    downloads: 620,
    format: "MPEG4 Video"
  },
  {
    identifier: "the-rifleman-s01e01-the-sharp-shooter",
    title: "The Rifleman: The Sharp Shooter",
    description: "Lucas McCain and his son Mark arrive in North Fork to buy a ranch and enter a local shooting match.",
    subject: ["Western", "Action", "Classic TV"],
    language: "English",
    creator: "nker150",
    downloads: 1890,
    format: "MPEG4 Video"
  },
  {
    identifier: "wagon-train-s01e01-the-willy-moran-story",
    title: "Wagon Train: The Willy Moran Story",
    description: "A former heavyweight champion battling alcoholism joins the wagon train to find a new life.",
    subject: ["Western", "Drama", "Classic TV"],
    language: "English",
    creator: "nker150",
    downloads: 510,
    format: "MPEG4 Video"
  },
  {
    identifier: "shotgun-slade-s01e01-the-salt-well",
    title: "Shotgun Slade: The Salt Well",
    description: "Slade is hired to investigate a mysterious dispute over a water well in the desert.",
    subject: ["Western", "Mystery", "Classic TV"],
    language: "English",
    creator: "nker150",
    downloads: 340,
    format: "MPEG4 Video"
  }
];

interface ScraperDashboardProps {
  onLogEvent: (message: string) => void;
  onRefreshChannels: () => void;
  onSelectChannel?: (channelId: string) => void;
}

export function ScraperDashboard({ onLogEvent, onRefreshChannels, onSelectChannel }: ScraperDashboardProps) {
  const [status, setStatus] = useState<ScraperStatus | null>(null);
  const [stats, setStats] = useState<DBStats | null>(null);
  const [cronInput, setCronInput] = useState('0 4 * * *');
  const [pollingIntervalInput, setPollingIntervalInput] = useState(60);
  const [geminiToggle, setGeminiToggle] = useState(true);
  const [stealthToggle, setStealthToggle] = useState(true);
  const [minDelay, setMinDelay] = useState(800);
  const [maxDelay, setMaxDelay] = useState(2200);
  const [isSaving, setIsSaving] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [complianceLogs, setComplianceLogs] = useState<any[]>([]);
  const [telemetryLogs, setTelemetryLogs] = useState<any[]>([]);
  const [activeRightTab, setActiveRightTab] = useState<'compliance' | 'telemetry' | 'backupPool'>('telemetry');

  // Backup Pool scraping states
  const [poolItems, setPoolItems] = useState<any[]>(DEFAULT_POOL_ITEMS);
  const [isScrapingPool, setIsScrapingPool] = useState(false);
  const [poolSearchQuery, setPoolSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('All');
  const [selectedFormat, setSelectedFormat] = useState<string>('All');
  const [accordionOpen, setAccordionOpen] = useState({
    subject: true,
    creator: true,
    language: true,
    format: true
  });

  useEffect(() => {
    const fetchArchivePoolItems = async () => {
      setIsScrapingPool(true);
      try {
        const query = 'uploader:nker150 AND mediatype:movies';
        const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier&fl[]=title&fl[]=description&fl[]=subject&fl[]=language&fl[]=downloads&fl[]=format&sort[]=downloads+desc&rows=100&output=json`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data?.response?.docs) {
            const fetched = data.response.docs.map((doc: any) => {
              const subRaw = doc.subject;
              let subjectArray: string[] = ['Western', 'Classic TV'];
              if (Array.isArray(subRaw)) {
                subjectArray = subRaw.map(s => String(s));
              } else if (typeof subRaw === 'string') {
                subjectArray = [subRaw];
              }
              return {
                identifier: doc.identifier,
                title: doc.title || doc.identifier,
                description: doc.description || 'Vintage television episode, public domain film, or serial drama retrieved from retro libraries.',
                subject: subjectArray,
                language: doc.language || 'English',
                creator: 'nker150',
                downloads: doc.downloads || Math.floor(100 + Math.random() * 2000),
                format: doc.format || 'MPEG4 Video'
              };
            });
            
            // Merge with DEFAULT_POOL_ITEMS, removing duplicates by identifier
            const merged = [...fetched];
            const seen = new Set(fetched.map(item => item.identifier));
            for (const item of DEFAULT_POOL_ITEMS) {
              if (!seen.has(item.identifier)) {
                merged.push(item);
                seen.add(item.identifier);
              }
            }
            setPoolItems(merged);
          }
        }
      } catch (err) {
        console.error('Archive.org pool fetch failed, loading default seed:', err);
      } finally {
        setIsScrapingPool(false);
      }
    };

    fetchArchivePoolItems();
  }, []);

  // IPTV 24h News Sync states
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState('ch-news-archive');
  const [isSyncingIPTV, setIsSyncingIPTV] = useState(false);
  const [syncStatuses, setSyncStatuses] = useState<Record<string, 'idle' | 'loading' | 'success' | 'failed'>>({});
  const [iptvResult, setIptvResult] = useState<{ success: boolean; message: string } | null>(null);
  const [iptvDailyAutomation, setIptvDailyAutomation] = useState(() => {
    return localStorage.getItem('iptv_daily_automation') === 'true';
  });

  // Third Eye Historical Backfill states
  const [backfillHours, setBackfillHours] = useState('4');
  const [backfillDays, setBackfillDays] = useState('');
  const [backfillStartDate, setBackfillStartDate] = useState('');
  const [backfillEndDate, setBackfillEndDate] = useState('');
  const [backfillMode, setBackfillMode] = useState<'filtered' | 'raw'>('filtered');
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ success: boolean; message: string } | null>(null);

  const fetchChannels = async () => {
    try {
      const res = await fetch('/api/channels');
      if (res.ok) {
        const data = await res.json();
        setChannels(data);
      }
    } catch (err) {
      console.error('Failed to load channels:', err);
    }
  };

  const fetchTelemetryLogs = async () => {
    try {
      const res = await fetch('/api/telemetry/report');
      if (res.ok) {
        const data = await res.json();
        setTelemetryLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to load telemetry logs:', err);
    }
  };

  const handleClearTelemetry = async () => {
    try {
      const res = await fetch('/api/telemetry/clear', { method: 'POST' });
      if (res.ok) {
        fetchTelemetryLogs();
        onLogEvent('Stream health diagnostics telemetry logs cleared.');
      }
    } catch (err) {
      console.error('Failed to clear telemetry:', err);
    }
  };

  // Poll scraper status and db stats periodically
  useEffect(() => {
    fetchStatus();
    fetchStats();
    fetchChannels();
    fetchComplianceLogs();
    fetchTelemetryLogs();

    const interval = setInterval(() => {
      // Pause polling if document is hidden to conserve bandwidth and reduce network requests
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchStatus();
      fetchStats();
      fetchComplianceLogs();
      fetchTelemetryLogs();
    }, 15000); // poll every 15s instead of 3s to reduce network requests

    return () => clearInterval(interval);
  }, []);

  // Automated daily IPTV sync trigger
  useEffect(() => {
    if (!iptvDailyAutomation) return;
    
    const lastSync = localStorage.getItem('iptv_last_sync_timestamp');
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    
    if (!lastSync || now - parseInt(lastSync, 10) > oneDayMs) {
      localStorage.setItem('iptv_last_sync_timestamp', String(now));
      onLogEvent('[IPTV Automation] Automated daily IPTV news sync triggered on load...');
      handleIPTVNewsSync(selectedChannelId, true);
    }
  }, [iptvDailyAutomation]);

  const handleIPTVNewsSync = async (targetId: string, isAutomatedRun = false) => {
    setIsSyncingIPTV(true);
    setSyncStatuses(prev => ({ ...prev, [targetId]: 'loading' }));
    setIptvResult(null);
    if (!isAutomatedRun) {
      onLogEvent(`IPTV Sync: Manually triggering last 24h news ingest for channel ID "${targetId}"...`);
    }

    try {
      const res = await fetch('/api/iptv-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: targetId })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIptvResult({ success: true, message: data.message });
        setSyncStatuses(prev => ({ ...prev, [targetId]: 'success' }));
        onLogEvent(`IPTV News Sync Success: Active programming for ${data.channelName} updated.`);
        localStorage.setItem('iptv_last_sync_timestamp', String(Date.now()));
        onRefreshChannels(); // Refresh parent listings
        fetchStats();        // Refresh DB stats count
      } else {
        setIptvResult({ success: false, message: data.error || 'Failed to sync IPTV content.' });
        setSyncStatuses(prev => ({ ...prev, [targetId]: 'failed' }));
        onLogEvent(`IPTV Sync Error: ${data.error || 'Failed to sync IPTV content.'}`);
      }
    } catch (err) {
      setIptvResult({ success: false, message: 'Network error during IPTV sync.' });
      setSyncStatuses(prev => ({ ...prev, [targetId]: 'failed' }));
      onLogEvent('IPTV Sync Error: Connection failed.');
    } finally {
      setIsSyncingIPTV(false);
    }
  };

  const handleToggleDailyAutomation = (val: boolean) => {
    setIptvDailyAutomation(val);
    localStorage.setItem('iptv_daily_automation', String(val));
    onLogEvent(`IPTV Automation: Daily background sync is now ${val ? 'ENABLED' : 'DISABLED'}.`);
  };

  const handleHistoricalBackfill = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsBackfilling(true);
    setBackfillResult(null);
    onLogEvent(`Third Eye Backfill: Starting historical backfill (Hours: ${backfillHours || 'N/A'}, Days: ${backfillDays || 'N/A'}, Range: ${backfillStartDate || 'N/A'} to ${backfillEndDate || 'N/A'}, Mode: ${backfillMode})...`);

    try {
      const res = await fetch('/api/thirdeye/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hours: backfillHours ? parseInt(backfillHours, 10) : undefined,
          days: backfillDays ? parseInt(backfillDays, 10) : undefined,
          startDate: backfillStartDate || undefined,
          endDate: backfillEndDate || undefined,
          mode: backfillMode
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setBackfillResult({ success: true, message: data.message });
        onLogEvent(`Third Eye Backfill Success: ${data.message}`);
        onRefreshChannels(); // Refresh parent listings
        fetchStats();        // Refresh DB stats count
      } else {
        setBackfillResult({ success: false, message: data.error || 'Failed to complete historical backfill.' });
        onLogEvent(`Third Eye Backfill Error: ${data.error || 'Failed to complete historical backfill.'}`);
      }
    } catch (err) {
      setBackfillResult({ success: false, message: 'Network error during backfill.' });
      onLogEvent('Third Eye Backfill Error: Connection failed.');
    } finally {
      setIsBackfilling(false);
    }
  };

  const runDailySourceUpdate = async () => {
    onLogEvent('[Daily Source Update] Executing 24h source update for News channels: fetching IPTV and purging stale (>48h) episodes...');
    try {
      const res = await fetch('/api/daily-source-update', {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onLogEvent(`[Daily Source Update] Success: ${data.message}`);
        fetchStats();
        onRefreshChannels();
      } else {
        onLogEvent(`[Daily Source Update] Error: ${data.error || 'Failed to complete update.'}`);
      }
    } catch (err) {
      console.error(err);
      onLogEvent('[Daily Source Update] Connection error triggered.');
    }
  };

  // Triggers every 24 hours while the dashboard is running
  useEffect(() => {
    const lastDailyUpdate = localStorage.getItem('last_daily_source_update_timestamp');
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (!lastDailyUpdate || now - parseInt(lastDailyUpdate, 10) > oneDayMs) {
      runDailySourceUpdate();
      localStorage.setItem('last_daily_source_update_timestamp', String(now));
    }

    const interval = setInterval(() => {
      runDailySourceUpdate();
      localStorage.setItem('last_daily_source_update_timestamp', String(Date.now()));
    }, oneDayMs);

    return () => clearInterval(interval);
  }, []);

  const prevStatusRef = useRef<string | undefined>(undefined);

  // Trigger parent refresh when scraper finishes
  useEffect(() => {
    const currentStatus = status?.status;
    const prev = prevStatusRef.current;
    if (currentStatus === 'completed' && (prev === 'scraping' || prev === 'enriching')) {
      onRefreshChannels();
      onLogEvent('Scraper finished. Channels list automatically updated with harvested programs.');
    }
    prevStatusRef.current = currentStatus;
  }, [status?.status]);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/scraper-status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.cronSchedule) setCronInput(data.cronSchedule);
        if (data.enrichWithGemini !== undefined) setGeminiToggle(data.enrichWithGemini);
        if (data.pollingIntervalMins !== undefined) setPollingIntervalInput(data.pollingIntervalMins);
      }
    } catch (err) {
      console.error('Failed to load scraper status:', err);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/database-stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to load database stats:', err);
    }
  };

  const fetchComplianceLogs = async () => {
    try {
      const res = await fetch('/api/compliance-logs');
      if (res.ok) {
        const data = await res.json();
        setComplianceLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to load compliance logs:', err);
    }
  };

  const handleTriggerScraper = async () => {
    if (isTriggering || status?.status === 'scraping' || status?.status === 'enriching') return;
    setIsTriggering(true);
    onLogEvent('Scraper trigger request submitted to background scheduler.');

    try {
      const res = await fetch('/api/trigger-scraper', { method: 'POST' });
      if (res.ok) {
        onLogEvent('Scraper started. Emulating browser sessions and AI enrichment...');
        fetchStatus();
      }
    } catch (err) {
      onLogEvent('Error launching background scraper.');
    } finally {
      setIsTriggering(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch('/api/scraper-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cronSchedule: cronInput,
          enrichWithGemini: geminiToggle,
          stealthMode: stealthToggle,
          minDelayMs: minDelay,
          maxDelayMs: maxDelay,
          pollingIntervalMins: pollingIntervalInput
        })
      });

      if (res.ok) {
        onLogEvent('Scraper stealth & scheduling parameters updated successfully.');
        onRefreshChannels(); // Refresh parent channels
        fetchStatus();
      }
    } catch (err) {
      onLogEvent('Failed to update scraper settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      const res = await fetch('/api/scraper-logs/clear', { method: 'POST' });
      if (res.ok) {
        fetchStatus();
        onLogEvent('Scraper console terminal logs cleared.');
      }
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = 2;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const getChannelHealthStatus = (channelId: string, channelName: string, streamUrl: string) => {
    const channelEvents = telemetryLogs.filter(log => log.channelId === channelId);
    
    const hasMediaError = channelEvents.some(log => log.event === 'media_routing_error' || log.event === 'hls_fatal_error');
    const hasOpaque = channelEvents.some(log => log.event === 'opaque_resource_detected');
    const stalls = channelEvents.filter(log => log.event === 'playback_stall');
    const hasStall = stalls.length > 0;

    if (hasMediaError) {
      return {
        status: '🔴 Failed',
        badge: 'bg-red-950/40 text-red-400 border border-red-500/20',
        detail: channelEvents.find(log => log.event === 'media_routing_error' || log.event === 'hls_fatal_error')?.cause || 'HLS/Routing failure',
        rule: 'Stream provider is blocking domain requests or CORS issue.'
      };
    }
    
    if (hasOpaque) {
      return {
        status: '🟡 Blocked',
        badge: 'bg-amber-950/40 text-amber-400 border border-amber-500/20',
        detail: 'CORS or Timing-Allow-Origin headers missing (transferSize: 0)',
        rule: 'Timing-Allow-Origin missing on asset server.'
      };
    }

    if (hasStall) {
      const avgDuration = stalls.reduce((sum, s) => sum + (s.durationSeconds || 0), 0) / stalls.length;
      return {
        status: '🟠 Stalled',
        badge: 'bg-orange-950/40 text-orange-400 border border-orange-500/20',
        detail: `Stalled ${stalls.length} times (avg ${avgDuration.toFixed(1)}s)`,
        rule: 'Verify server timing/CORS constraints or stream bandwidth.'
      };
    }

    return {
      status: '🟢 Healthy',
      badge: 'bg-green-950/40 text-green-400 border border-green-500/20',
      detail: 'Playing smoothly via legacy blob container or routed stream.',
      rule: 'None'
    };
  };

  const isRunning = status?.status === 'scraping' || status?.status === 'enriching';

  return (
    <div id="scraper-dashboard" className="grid grid-cols-1 xl:grid-cols-3 gap-6 text-white p-2">
      
      {/* COLUMN 1: Active Ticker & Database Stats */}
      <div className="space-y-6">
        
        {/* Scraper Status Card */}
        <div className="bg-gradient-to-br from-[#120f1d] via-[#0b0a0e] to-[#0f0f12] border border-purple-500/15 shadow-[0_0_50px_rgba(139,92,246,0.03)] hover:border-purple-500/25 transition-all duration-300 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black tracking-wider text-purple-400 uppercase font-mono flex items-center gap-2">
              <Cpu className="w-4 h-4 text-purple-400" />
              Scraper Engine
            </h3>
            
            {/* Status pill badge */}
            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-mono font-black uppercase tracking-wider flex items-center gap-1.5 ${
              status?.status === 'scraping' ? 'bg-amber-950/40 text-amber-400 border border-amber-500/20' :
              status?.status === 'enriching' ? 'bg-purple-950/40 text-purple-400 border border-purple-500/20' :
              status?.status === 'completed' ? 'bg-green-950/40 text-green-400 border border-green-500/20' :
              status?.status === 'failed' ? 'bg-red-950/40 text-red-400 border border-red-500/20' :
              'bg-white/5 text-white/40 border border-white/5'
            }`}>
              {isRunning && <RefreshCw className="w-3 h-3 animate-spin text-current" />}
              {status?.status === 'completed' && <CheckCircle className="w-3 h-3 text-green-400" />}
              {status?.status === 'failed' && <XCircle className="w-3 h-3 text-red-400" />}
              {status?.status || 'STANDBY'}
            </span>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Current Task</div>
            <p className="text-xs text-white/80 font-sans leading-relaxed min-h-[36px]">
              {status?.currentTask || 'Idle.'}
            </p>
          </div>

          {/* Progress bar track */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[9px] font-mono text-white/30">
              <span>SYNC STATUS</span>
              <span>{status?.progress || 0}%</span>
            </div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
              <div 
                className={`h-full rounded-full transition-all duration-700 bg-gradient-to-r ${
                  status?.status === 'enriching' ? 'from-purple-500 to-indigo-400' : 'from-amber-500 to-yellow-400'
                }`}
                style={{ width: `${status?.progress || 0}%` }}
              />
            </div>
          </div>

          {/* On-Demand Trigger Row */}
          <div className="pt-2">
            <button
              onClick={handleTriggerScraper}
              disabled={isRunning || isTriggering}
              className={`w-full py-2.5 rounded-xl text-xs font-black tracking-widest uppercase transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer ${
                isRunning 
                  ? 'bg-white/5 text-white/30 cursor-not-allowed border border-white/5'
                  : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/10 hover:shadow-purple-900/30'
              }`}
            >
              <Play className="w-3.5 h-3.5 text-current fill-current" />
              {isRunning ? 'Scraping Active...' : 'Sync listings & AI Metadata Now'}
            </button>
            <p className="text-[8px] font-mono text-white/20 mt-2 text-center uppercase tracking-widest">
              Triggers background headless worker
            </p>
          </div>
        </div>

        {/* Database Stats Card */}
        <div className="bg-[#0f0f12] border border-white/5 rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-black tracking-wider text-indigo-400 uppercase font-mono flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-400" />
            SQLite File Stats
          </h3>

          <div className="grid grid-cols-2 gap-3.5 text-left">
            <div className="p-3 bg-white/2 border border-white/5 rounded-xl">
              <div className="text-[9px] font-mono text-white/30 uppercase tracking-wider">Total Shows</div>
              <p className="text-lg font-black text-white mt-1">{stats?.totalShows || 0}</p>
            </div>
            <div className="p-3 bg-white/2 border border-white/5 rounded-xl">
              <div className="text-[9px] font-mono text-white/30 uppercase tracking-wider">Total Episodes</div>
              <p className="text-lg font-black text-white mt-1">{stats?.totalEpisodes || 0}</p>
            </div>
            <div className="p-3 bg-white/2 border border-white/5 rounded-xl">
              <div className="text-[9px] font-mono text-white/30 uppercase tracking-wider">DB File Size</div>
              <p className="text-sm font-black text-white mt-2 font-mono">{formatBytes(stats?.dbFileSize || 0)}</p>
            </div>
            <div className="p-3 bg-white/2 border border-white/5 rounded-xl">
              <div className="text-[9px] font-mono text-white/30 uppercase tracking-wider">Query Counts</div>
              <p className="text-sm font-black text-[#8c5cd0] mt-2 font-mono">{stats?.queryCount || 0} Pings</p>
            </div>
          </div>

          <div className="border-t border-white/5 pt-3.5 space-y-2 text-xs font-sans text-white/60">
            <div className="flex justify-between items-center text-[10px]">
              <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-white/30" /> Last Sync Run:</span>
              <span className="font-mono text-white text-[9px]">{status?.lastRunTimestamp || 'Never'}</span>
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-white/30" /> Database File:</span>
              <span className="font-mono text-white text-[9px]">/data/database.json</span>
            </div>
          </div>
        </div>

      </div>

      {/* COLUMN 2: Stealth Evasion & Scheduler Settings & IPTV Sync */}
      <div className="space-y-6 flex flex-col">
        {/* Stealth Evasion & Cron Settings Card */}
        <div className="bg-[#0f0f12] border border-white/5 rounded-2xl p-5 flex flex-col justify-between">
          <form onSubmit={handleSaveSettings} className="space-y-4 text-left">
            <h3 className="text-xs font-black tracking-wider text-amber-400 uppercase font-mono flex items-center gap-2 border-b border-white/5 pb-2">
              <Settings className="w-4 h-4 text-amber-400" />
              Stealth Evasion & Cron Settings
            </h3>

            {/* Cron input */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono font-bold text-white/40 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-white/30" />
                Daily Cron Schedule
              </label>
              <input
                type="text"
                value={cronInput}
                onChange={(e) => setCronInput(e.target.value)}
                placeholder="e.g. 0 4 * * *"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-purple-500 transition-colors"
              />
              <p className="text-[8px] font-mono text-white/30 uppercase tracking-wide">
                Default standard is daily at 4:00 AM (0 4 * * *)
              </p>
            </div>

            {/* Stealth toggle */}
            <div className="flex items-center justify-between p-2.5 bg-white/2 border border-white/5 rounded-xl">
              <div>
                <div className="text-[10px] font-black tracking-wide text-white">Spoof User-Agent</div>
                <div className="text-[8px] font-mono text-white/30 uppercase mt-0.5">Rotate stealth headers to bypass blocks</div>
              </div>
              <input 
                type="checkbox"
                checked={stealthToggle}
                onChange={(e) => setStealthToggle(e.target.checked)}
                className="w-4 h-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded cursor-pointer"
              />
            </div>

            {/* Gemini toggle */}
            <div className="flex items-center justify-between p-2.5 bg-white/2 border border-white/5 rounded-xl">
              <div>
                <div className="text-[10px] font-black tracking-wide text-white flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-purple-400" />
                  Gemini AI Enrichment
                </div>
                <div className="text-[8px] font-mono text-white/30 uppercase mt-0.5">Synthesize plots, trivia & cast info</div>
              </div>
              <input 
                type="checkbox"
                checked={geminiToggle}
                onChange={(e) => setGeminiToggle(e.target.checked)}
                className="w-4 h-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded cursor-pointer"
              />
            </div>

            {/* Emulated Request Delays */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="space-y-1.5">
                <label className="text-[8px] font-mono font-bold text-white/30 uppercase tracking-wider">Min delay (ms)</label>
                <input
                  type="number"
                  value={minDelay}
                  onChange={(e) => setMinDelay(Number(e.target.value))}
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-xs font-mono text-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[8px] font-mono font-bold text-white/30 uppercase tracking-wider">Max delay (ms)</label>
                <input
                  type="number"
                  value={maxDelay}
                  onChange={(e) => setMaxDelay(Number(e.target.value))}
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-xs font-mono text-white"
                />
              </div>
            </div>

            {/* Background Polling Interval */}
            <div className="space-y-1.5 pt-2">
              <label className="text-[8px] font-mono font-bold text-white/30 uppercase tracking-wider">Background News Polling Interval (minutes)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="5"
                  value={pollingIntervalInput}
                  onChange={(e) => setPollingIntervalInput(Math.max(5, Number(e.target.value)))}
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs font-mono text-white"
                />
                <span className="text-[10px] text-white/40 font-mono shrink-0">mins</span>
              </div>
            </div>
          </form>

          <button
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="w-full bg-amber-600 hover:bg-amber-500 py-2.5 text-xs font-black tracking-widest text-white uppercase rounded-xl transition-colors mt-4 cursor-pointer"
          >
            {isSaving ? 'Saving Configurations...' : 'Save Stealth & Schedule Parameters'}
          </button>
        </div>

        {/* NEW: IPTV News Sync & Automation Card */}
        <div className="bg-gradient-to-br from-[#0c121e] via-[#090b10] to-[#0f0f12] border border-blue-500/15 shadow-[0_0_50px_rgba(59,130,246,0.02)] hover:border-blue-500/25 transition-all duration-300 rounded-2xl p-5 space-y-4 text-left">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black tracking-wider text-blue-400 uppercase font-mono flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-400" />
              IPTV Live News Sync
            </h3>
            <span className={`px-2 py-0.5 rounded-full text-[8px] font-mono font-black uppercase tracking-wider border ${
              isSyncingIPTV 
                ? 'bg-blue-950/40 text-blue-400 border-blue-500/20' 
                : 'bg-white/5 text-white/40 border-white/5'
            }`}>
              {isSyncingIPTV ? 'SYNCING' : 'READY'}
            </span>
          </div>

          <p className="text-[11px] text-white/60 font-sans leading-relaxed">
            Fetch actual live or recent news reports from simulated open-source public IPTV news APIs. Updates the EPG scheduling cycle dynamically with the last 24 hours of broadcasts, completely replacing obsolete static episode files.
          </p>

          <div className="space-y-3.5 pt-2">
            {/* News Source Grid Selection */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono font-bold text-white/40 uppercase tracking-wider">
                Select News Channel Source
              </label>
              
              <div className="grid grid-cols-2 gap-2" id="news-channels-grid">
                {(channels.filter(ch => ch.category === 'News').length > 0
                  ? channels.filter(ch => ch.category === 'News')
                  : channels.slice(0, 4)
                ).map((ch) => {
                  const isSelected = selectedChannelId === ch.id;
                  const currentStatus = syncStatuses[ch.id] || 'idle';
                  
                  return (
                    <div
                      key={ch.id}
                      id={`news-tile-${ch.id}`}
                      onClick={() => {
                        setSelectedChannelId(ch.id);
                        setIptvResult(null);
                      }}
                      className={`relative p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-24 select-none ${
                        isSelected
                          ? 'bg-blue-950/25 border-blue-500/40 shadow-lg shadow-blue-500/5'
                          : 'bg-white/2 border-white/5 hover:border-white/10 hover:bg-white/4'
                      }`}
                    >
                      {/* Top row: Name & Number, and Refresh button */}
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="min-w-0 flex-1">
                          <span className="text-[8px] font-mono text-white/30 uppercase block">CH {ch.number}</span>
                          <h4 className="text-[10px] font-bold text-white truncate leading-snug mt-0.5">{ch.name}</h4>
                        </div>
                        
                        <button
                          id={`refresh-btn-${ch.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedChannelId(ch.id);
                            handleIPTVNewsSync(ch.id);
                          }}
                          disabled={isSyncingIPTV}
                          className="p-1 rounded bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer disabled:opacity-40"
                          title={`Refresh ${ch.name}`}
                        >
                          <RefreshCw className={`w-3 h-3 ${currentStatus === 'loading' ? 'animate-spin text-blue-400' : ''}`} />
                        </button>
                      </div>

                      {/* Bottom row: Status badge */}
                      <div className="mt-2 flex items-center justify-between">
                        <span className={`px-2 py-0.5 rounded-md text-[8px] font-mono font-bold uppercase tracking-wider border ${
                          currentStatus === 'loading'
                            ? 'bg-blue-950/40 text-blue-400 border-blue-500/20'
                            : currentStatus === 'success'
                            ? 'bg-green-950/40 text-green-400 border-green-500/20'
                            : currentStatus === 'failed'
                            ? 'bg-red-950/40 text-red-400 border-red-500/20'
                            : 'bg-white/5 text-white/40 border-white/5'
                        }`}>
                          {currentStatus === 'loading' ? 'Loading' : currentStatus === 'success' ? 'Success' : currentStatus === 'failed' ? 'Failed' : 'Ready'}
                        </span>
                        
                        {/* Tiny dot indicator */}
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          currentStatus === 'loading' ? 'bg-blue-400 animate-pulse' :
                          currentStatus === 'success' ? 'bg-green-400' :
                          currentStatus === 'failed' ? 'bg-red-400' :
                          'bg-white/20'
                        }`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Daily Automation Toggle */}
            <div className="flex items-center justify-between p-2.5 bg-white/2 border border-white/5 rounded-xl">
              <div>
                <div className="text-[10px] font-black tracking-wide text-white">Automate Daily Sync</div>
                <div className="text-[8px] font-mono text-white/30 uppercase mt-0.5">
                  Fetch & replace news daily on dashboard load
                </div>
              </div>
              <input 
                type="checkbox"
                checked={iptvDailyAutomation}
                onChange={(e) => handleToggleDailyAutomation(e.target.checked)}
                className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
              />
            </div>

            {/* Execution Result Indicator */}
            {iptvResult && (
              <div className={`p-3 rounded-xl text-xs flex gap-2 ${
                iptvResult.success 
                  ? 'bg-green-950/20 text-green-400 border border-green-500/20' 
                  : 'bg-red-950/20 text-red-400 border border-red-500/20'
              }`}>
                {iptvResult.success ? (
                  <Check className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                )}
                <span>{iptvResult.message}</span>
              </div>
            )}

            {/* Trigger Button */}
            <button
              onClick={() => handleIPTVNewsSync(selectedChannelId)}
              disabled={isSyncingIPTV}
              className={`w-full py-2 rounded-xl text-xs font-black tracking-widest uppercase transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer ${
                isSyncingIPTV 
                  ? 'bg-white/5 text-white/30 cursor-not-allowed border border-white/5'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/10 hover:shadow-blue-900/30'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 text-current ${isSyncingIPTV ? 'animate-spin' : ''}`} />
              {isSyncingIPTV ? 'Syncing News Feed...' : 'Sync Selected Channel'}
            </button>

            {/* Daily Source Update Trigger */}
            <button
              onClick={runDailySourceUpdate}
              className="w-full py-2 rounded-xl text-xs font-black tracking-widest uppercase transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-900/10 hover:shadow-cyan-900/30"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-200" />
              Force Daily Source Update
            </button>

            {/* Third Eye Historical Backfill Panel */}
            <div className="border-t border-white/5 pt-3.5 mt-3.5 space-y-3">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                <h4 className="text-[10px] font-black tracking-wider text-blue-400 uppercase font-mono">
                  Third Eye Historical Backfill
                </h4>
              </div>
              
              <p className="text-[10px] text-white/50 leading-relaxed font-sans">
                Refactor and unlock deep historical crawls. Query Archive.org's live optical character recognition database by hours, days, or custom ranges instead of a simple live stream filter.
              </p>

              <form onSubmit={handleHistoricalBackfill} className="space-y-3">
                {/* Mode Select */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[8px] font-mono text-white/40 uppercase block">Ingest Mode</label>
                    <select
                      value={backfillMode}
                      onChange={(e) => setBackfillMode(e.target.value as 'filtered' | 'raw')}
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none focus:border-blue-500 transition-colors"
                    >
                      <option value="filtered">Filtered (Clean)</option>
                      <option value="raw">Raw (Full Ingest)</option>
                    </select>
                  </div>

                  {/* Filter range selector */}
                  <div className="space-y-1">
                    <label className="text-[8px] font-mono text-white/40 uppercase block">Time Filter Type</label>
                    <select
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'hours') {
                          setBackfillHours('4');
                          setBackfillDays('');
                          setBackfillStartDate('');
                          setBackfillEndDate('');
                        } else if (val === 'days') {
                          setBackfillHours('');
                          setBackfillDays('1');
                          setBackfillStartDate('');
                          setBackfillEndDate('');
                        } else if (val === 'range') {
                          setBackfillHours('');
                          setBackfillDays('');
                          setBackfillStartDate(new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().split('T')[0]);
                          setBackfillEndDate(new Date().toISOString().split('T')[0]);
                        }
                      }}
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none focus:border-blue-500 transition-colors"
                    >
                      <option value="hours">Hours Window</option>
                      <option value="days">Days Window</option>
                      <option value="range">Custom Date Range</option>
                    </select>
                  </div>
                </div>

                {/* Conditional Inputs based on state selection */}
                {backfillHours !== '' && (
                  <div className="space-y-1">
                    <label className="text-[8px] font-mono text-white/40 uppercase block">Backfill Hours</label>
                    <input
                      type="number"
                      min="1"
                      max="48"
                      value={backfillHours}
                      onChange={(e) => {
                        setBackfillHours(e.target.value);
                        setBackfillDays('');
                        setBackfillStartDate('');
                        setBackfillEndDate('');
                      }}
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-2.5 py-1 text-[10px] text-white focus:outline-none focus:border-blue-500 transition-colors"
                      placeholder="e.g. 4"
                    />
                  </div>
                )}

                {backfillDays !== '' && (
                  <div className="space-y-1">
                    <label className="text-[8px] font-mono text-white/40 uppercase block">Backfill Days</label>
                    <input
                      type="number"
                      min="1"
                      max="14"
                      value={backfillDays}
                      onChange={(e) => {
                        setBackfillDays(e.target.value);
                        setBackfillHours('');
                        setBackfillStartDate('');
                        setBackfillEndDate('');
                      }}
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-2.5 py-1 text-[10px] text-white focus:outline-none focus:border-blue-500 transition-colors"
                      placeholder="e.g. 1"
                    />
                  </div>
                )}

                {backfillHours === '' && backfillDays === '' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[8px] font-mono text-white/40 uppercase block">Start Date</label>
                      <input
                        type="date"
                        value={backfillStartDate}
                        onChange={(e) => setBackfillStartDate(e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-mono text-white/40 uppercase block">End Date</label>
                      <input
                        type="date"
                        value={backfillEndDate}
                        onChange={(e) => setBackfillEndDate(e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                  </div>
                )}

                {/* Backfill Response Message */}
                {backfillResult && (
                  <div className={`p-2.5 rounded-lg text-[10px] flex gap-1.5 leading-relaxed ${
                    backfillResult.success
                      ? 'bg-green-950/20 text-green-400 border border-green-500/10'
                      : 'bg-red-950/20 text-red-400 border border-red-500/10'
                  }`}>
                    {backfillResult.success ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    )}
                    <span>{backfillResult.message}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isBackfilling}
                  className={`w-full py-1.5 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer ${
                    isBackfilling
                      ? 'bg-white/5 text-white/30 cursor-not-allowed border border-white/5'
                      : 'bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white shadow-md shadow-blue-900/15'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-current ${isBackfilling ? 'animate-spin' : ''}`} />
                  {isBackfilling ? 'Executing Backfill...' : 'Trigger Backfill'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* COLUMN 3: Real-Time Scraper Execution Log Terminal & Compliance Audit */}
      <div className="bg-[#0f0f12] border border-white/5 rounded-2xl p-5 flex flex-col gap-5 h-[650px] xl:h-full justify-between">
        {/* Sub-section 1: Scraper Terminal */}
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3">
            <h3 className="text-xs font-black tracking-wider text-rose-400 uppercase font-mono flex items-center gap-2">
              <Terminal className="w-4 h-4 text-rose-400" />
              Stealth Scraper Terminal
            </h3>
            <button
              onClick={handleClearLogs}
              className="text-white/30 hover:text-red-400 p-1.5 rounded hover:bg-white/5 transition-all text-[9px] font-mono uppercase tracking-widest flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-current" />
              Clear logs
            </button>
          </div>

          {/* Real logs stream terminal */}
          <div className="flex-1 bg-black/60 rounded-xl p-3.5 font-mono text-[9px] text-[#22c55e] overflow-y-auto space-y-1.5 scrollbar-thin text-left border border-white/5 min-h-0">
            {status?.logs && status.logs.length > 0 ? (
              status.logs.map((log, lIdx) => (
                <div key={lIdx} className="leading-relaxed whitespace-pre-wrap break-all hover:bg-white/2 p-0.5 rounded transition-colors">
                  {log}
                </div>
              ))
            ) : (
              <div className="text-white/20 flex flex-col items-center justify-center h-full gap-2">
                <ShieldAlert className="w-5 h-5 text-white/10" />
                <p className="text-[10px]">No scraper telemetry loaded. Standby.</p>
              </div>
            )}
          </div>
        </div>

        {/* Sub-section 2: Compliance, Telemetry, or Backup Pool Switcher */}
        <div className="flex flex-col flex-1 min-h-0 border-t border-white/5 pt-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveRightTab('telemetry')}
                className={`text-[10px] font-black tracking-wider uppercase font-mono flex items-center gap-1 pb-1 border-b-2 transition-all cursor-pointer ${
                  activeRightTab === 'telemetry' ? 'text-rose-400 border-rose-400 font-bold' : 'text-white/30 border-transparent hover:text-white/60'
                }`}
              >
                <Radio className="w-3 h-3" />
                Stream Health
              </button>
              <button
                type="button"
                onClick={() => setActiveRightTab('compliance')}
                className={`text-[10px] font-black tracking-wider uppercase font-mono flex items-center gap-1 pb-1 border-b-2 transition-all cursor-pointer ${
                  activeRightTab === 'compliance' ? 'text-amber-400 border-amber-400 font-bold' : 'text-white/30 border-transparent hover:text-white/60'
                }`}
              >
                <ShieldAlert className="w-3 h-3" />
                Security Audit
              </button>
              <button
                type="button"
                onClick={() => setActiveRightTab('backupPool')}
                className={`text-[10px] font-black tracking-wider uppercase font-mono flex items-center gap-1 pb-1 border-b-2 transition-all cursor-pointer ${
                  activeRightTab === 'backupPool' ? 'text-pink-400 border-pink-400 font-bold' : 'text-white/30 border-transparent hover:text-white/60'
                }`}
              >
                <Film className="w-3 h-3" />
                Fail-safe Pool
              </button>
            </div>
            {activeRightTab === 'telemetry' ? (
              <button
                type="button"
                onClick={handleClearTelemetry}
                className="text-white/30 hover:text-red-400 p-1 rounded hover:bg-white/5 transition-all text-[9px] font-mono uppercase tracking-widest flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3 text-current" />
                Clear
              </button>
            ) : activeRightTab === 'compliance' ? (
              <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest">
                Logs: {complianceLogs.length}
              </span>
            ) : (
              <span className="text-[9px] font-mono text-pink-400 uppercase tracking-widest font-bold">
                Pool Size: {poolItems.length}
              </span>
            )}
          </div>

          {activeRightTab === 'telemetry' ? (
            <div className="flex flex-col flex-1 min-h-0 gap-3">
              {/* Stream Health Matrix Table */}
              <div className="bg-black/35 rounded-xl border border-white/5 p-2 font-mono text-[9px] overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[320px]">
                  <thead>
                    <tr className="border-b border-white/5 text-white/40 uppercase tracking-wider text-[8px]">
                      <th className="pb-1.5 font-bold">Channel</th>
                      <th className="pb-1.5 font-bold text-center">Status</th>
                      <th className="pb-1.5 font-bold">Diagnostics Details</th>
                      <th className="pb-1.5 font-bold hidden md:table-cell">Rule Checked</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {(channels.length > 0 ? channels : [
                      { id: 'ch-westerns', name: 'Classic Westerns HD', url: 'https://archive.org/download/s-01.-e-17-ella-west.ia/S01.E01%20Three%20Bells%20To%20Predido.ia.mp4' },
                      { id: 'ch-retro-adventure', name: 'Classic Cinema & Movies', url: 'https://archive.org/download/s-01e-02.-point-blank/Maverick%20S02e01%20-%20The%20Day%20They%20Hanged%20Bret%20Maverick.mp4' },
                      { id: 'ch-retro-newsreels', name: 'Universal Retro Newsreels', url: 'https://archive.org/download/1945-03-15_Allies_Open_Final_Drive_In_Germany/1945-03-15_Allies_Open_Final_Drive_In_Germany.mp4' },
                      { id: 'ch-cnn', name: 'CNN News Feed', url: 'https://cnn-cnninternational-1-us.us.connected.tv/playlist.m3u8' }
                    ]).map(ch => {
                      const health = getChannelHealthStatus(ch.id, ch.name, ch.url || '');
                      return (
                        <tr key={ch.id} className="hover:bg-white/2 transition-colors">
                          <td className="py-1.5 font-bold text-white max-w-[80px] truncate">{ch.name}</td>
                          <td className="py-1.5 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${health.badge}`}>
                              {health.status}
                            </span>
                          </td>
                          <td className="py-1.5 text-white/70 max-w-[120px] truncate" title={health.detail}>{health.detail}</td>
                          <td className="py-1.5 text-white/40 max-w-[120px] truncate hidden md:table-cell" title={health.rule}>{health.rule}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Real-time Telemetry Event Feed Stream */}
              <div className="flex-1 bg-black/60 rounded-xl p-3 font-mono text-[8px] text-sky-300 overflow-y-auto space-y-1 scrollbar-thin text-left border border-white/5 min-h-0">
                {telemetryLogs.length > 0 ? (
                  [...telemetryLogs].reverse().map((log, tIdx) => {
                    const timeStr = log.timestamp ? new Date(log.timestamp).toTimeString().split(' ')[0] : '00:00:00';
                    return (
                      <div key={tIdx} className="leading-relaxed hover:bg-white/2 p-0.5 rounded transition-colors border-l border-sky-500/30 pl-1.5 animate-fadeIn">
                        <span className="text-white/30">[{timeStr}]</span>{' '}
                        <span className="text-pink-400 uppercase font-black">[{log.event}]</span>{' '}
                        <span className="text-white font-bold">{log.channelName || log.channelId}</span> - {log.cause || log.errorDetails || log.errorType || `Duration: ${log.durationSeconds?.toFixed(2)}s` || 'Event received'}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-white/20 flex flex-col items-center justify-center h-full gap-1.5">
                    <Radio className="w-4 h-4 text-white/10 animate-pulse" />
                    <p className="text-[9px]">No live playbacks tracked. Play a channel to trigger telemetry.</p>
                  </div>
                )}
              </div>
            </div>
          ) : activeRightTab === 'compliance' ? (
            /* Compliance logs stream */
            <div className="flex-1 bg-black/60 rounded-xl p-3.5 font-mono text-[9px] text-amber-300 overflow-y-auto space-y-1.5 scrollbar-thin text-left border border-white/5 min-h-0">
              {complianceLogs.length > 0 ? (
                complianceLogs.map((log, cIdx) => {
                  const displayText = typeof log === 'string'
                    ? log
                    : `[${log?.date || ''} ${log?.timestamp || ''}] [OPERATOR: ${log?.operatorAccount || ''}] Action: ${log?.actionSignature || ''} | Details: ${log?.details || ''}`;
                  return (
                    <div key={cIdx} className="leading-relaxed whitespace-pre-wrap break-all hover:bg-white/2 p-0.5 rounded transition-colors border-l-2 border-amber-500/20 pl-1.5 animate-fadeIn">
                      {displayText}
                    </div>
                  );
                })
              ) : (
                <div className="text-white/20 flex flex-col items-center justify-center h-full gap-2">
                  <ShieldAlert className="w-5 h-5 text-white/10" />
                  <p className="text-[10px]">No compliance audit logs loaded.</p>
                </div>
              )}
            </div>
          ) : (
            /* Backup Pool Tab - Facet Sidebar / Filter Panel + Card Grid */
            (() => {
              const filteredPoolItems = poolItems.filter(item => {
                const matchesSearch = item.title.toLowerCase().includes(poolSearchQuery.toLowerCase()) || 
                                      item.identifier.toLowerCase().includes(poolSearchQuery.toLowerCase()) ||
                                      item.description.toLowerCase().includes(poolSearchQuery.toLowerCase());
                
                const matchesSubject = selectedSubject === 'All' || item.subject.some((s: string) => s.toLowerCase() === selectedSubject.toLowerCase());
                const matchesFormat = selectedFormat === 'All' || item.format.toLowerCase() === selectedFormat.toLowerCase();
                
                return matchesSearch && matchesSubject && matchesFormat;
              });

              return (
                <div className="flex flex-col flex-1 min-h-0 gap-3 text-left">
                  {/* Search bar + Result Count */}
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <Search className="w-3 h-3 text-white/40 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search 100+ backup clips..."
                        value={poolSearchQuery}
                        onChange={(e) => setPoolSearchQuery(e.target.value)}
                        className="w-full bg-black/40 border border-white/5 rounded-lg pl-8 pr-3 py-1 text-[10px] text-white focus:outline-none focus:border-pink-500 transition-all font-mono"
                      />
                    </div>
                    <div className="text-[9px] font-mono text-pink-400 shrink-0 font-bold bg-pink-500/10 border border-pink-500/20 px-2 py-0.5 rounded">
                      {filteredPoolItems.length} Results
                    </div>
                  </div>

                  {/* Sidebar + Items panel */}
                  <div className="flex flex-1 min-h-0 gap-2.5">
                    
                    {/* Facet Sidebar */}
                    <div className="w-[100px] sm:w-[120px] border-r border-white/5 pr-2.5 flex flex-col gap-2 overflow-y-auto scrollbar-thin">
                      
                      {/* Accordion: Subject */}
                      <div className="border border-white/5 rounded-lg bg-black/20 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setAccordionOpen(p => ({ ...p, subject: !p.subject }))}
                          className="w-full px-1.5 py-1 flex items-center justify-between text-[8px] font-bold text-white uppercase tracking-wider bg-white/2 hover:bg-white/5 transition-all font-mono"
                        >
                          <span className="flex items-center gap-1">
                            <Filter className="w-2.5 h-2.5 text-pink-400" />
                            Subject
                          </span>
                          {accordionOpen.subject ? <ChevronUp className="w-2.5 h-2.5 text-white/50" /> : <ChevronDown className="w-2.5 h-2.5 text-white/50" />}
                        </button>
                        {accordionOpen.subject && (
                          <div className="p-1 flex flex-col gap-0.5 text-[7px] font-mono">
                            {['All', 'Western', 'Classic TV', 'Action', 'Drama', 'Anthology'].map(sub => (
                              <button
                                key={sub}
                                type="button"
                                onClick={() => setSelectedSubject(sub)}
                                className={`px-1 py-0.5 rounded text-left transition-all truncate ${
                                  selectedSubject === sub 
                                    ? 'bg-pink-500/25 text-pink-400 font-bold border border-pink-500/15' 
                                    : 'text-white/50 hover:text-white hover:bg-white/5'
                                }`}
                                title={sub}
                              >
                                {sub}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Accordion: Creator */}
                      <div className="border border-white/5 rounded-lg bg-black/20 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setAccordionOpen(p => ({ ...p, creator: !p.creator }))}
                          className="w-full px-1.5 py-1 flex items-center justify-between text-[8px] font-bold text-white uppercase tracking-wider bg-white/2 hover:bg-white/5 transition-all font-mono"
                        >
                          <span className="flex items-center gap-1">
                            <Cpu className="w-2.5 h-2.5 text-amber-400" />
                            Creator
                          </span>
                          {accordionOpen.creator ? <ChevronUp className="w-2.5 h-2.5 text-white/50" /> : <ChevronDown className="w-2.5 h-2.5 text-white/50" />}
                        </button>
                        {accordionOpen.creator && (
                          <div className="p-1 flex flex-col gap-0.5 text-[7px] font-mono text-white/60">
                            <div className="px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/15 text-center font-bold truncate">
                              @nker150
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Accordion: Format */}
                      <div className="border border-white/5 rounded-lg bg-black/20 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setAccordionOpen(p => ({ ...p, format: !p.format }))}
                          className="w-full px-1.5 py-1 flex items-center justify-between text-[8px] font-bold text-white uppercase tracking-wider bg-white/2 hover:bg-white/5 transition-all font-mono"
                        >
                          <span className="flex items-center gap-1">
                            <Film className="w-2.5 h-2.5 text-sky-400" />
                            Format
                          </span>
                          {accordionOpen.format ? <ChevronUp className="w-2.5 h-2.5 text-white/50" /> : <ChevronDown className="w-2.5 h-2.5 text-white/50" />}
                        </button>
                        {accordionOpen.format && (
                          <div className="p-1 flex flex-col gap-0.5 text-[7px] font-mono">
                            {['All', 'MPEG4 Video'].map(f => (
                              <button
                                key={f}
                                type="button"
                                onClick={() => setSelectedFormat(f)}
                                className={`px-1 py-0.5 rounded text-left transition-all truncate ${
                                  selectedFormat === f 
                                    ? 'bg-sky-500/25 text-sky-400 font-bold border border-sky-500/15' 
                                    : 'text-white/50 hover:text-white hover:bg-white/5'
                                }`}
                              >
                                {f}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Accordion: Language */}
                      <div className="border border-white/5 rounded-lg bg-black/20 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setAccordionOpen(p => ({ ...p, language: !p.language }))}
                          className="w-full px-1.5 py-1 flex items-center justify-between text-[8px] font-bold text-white uppercase tracking-wider bg-white/2 hover:bg-white/5 transition-all font-mono"
                        >
                          <span className="flex items-center gap-1">
                            <Globe className="w-2.5 h-2.5 text-teal-400" />
                            Language
                          </span>
                          {accordionOpen.language ? <ChevronUp className="w-2.5 h-2.5 text-white/50" /> : <ChevronDown className="w-2.5 h-2.5 text-white/50" />}
                        </button>
                        {accordionOpen.language && (
                          <div className="p-1 flex flex-col gap-0.5 text-[7px] font-mono text-white/60">
                            <div className="px-1 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/15 text-center font-bold">
                              English
                            </div>
                          </div>
                        )}
                      </div>

                    </div>

                    {/* Card Grid */}
                    <div className="flex-1 overflow-y-auto scrollbar-thin pr-1">
                      {isScrapingPool ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-2 text-white/30 font-mono text-[9px]">
                          <RefreshCw className="w-3.5 h-3.5 text-pink-400 animate-spin" />
                          <p>Lazy loading from Archive.org advancedsearch...</p>
                        </div>
                      ) : filteredPoolItems.length > 0 ? (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 pb-4">
                          {filteredPoolItems.map((item, idx) => (
                            <div 
                              key={item.identifier + idx} 
                              className="bg-black/45 border border-white/5 p-2 rounded-xl flex flex-col justify-between gap-1 hover:border-pink-500/30 hover:bg-white/2 transition-all font-mono text-[8px]"
                            >
                              <div>
                                <div className="flex items-center justify-between gap-1 text-[7px]">
                                  <span className="text-white/30 truncate max-w-[80px]">ID: {item.identifier}</span>
                                  <span className="text-pink-400 font-bold shrink-0">{item.downloads.toLocaleString()} DLs</span>
                                </div>
                                <h4 className="text-[9px] font-bold text-white line-clamp-1 mt-0.5" title={item.title}>
                                  {item.title}
                                </h4>
                                <p className="text-white/50 line-clamp-2 mt-1 leading-relaxed text-[7px]">
                                  {item.description}
                                </p>
                              </div>
                              
                              <div className="flex gap-1 pt-1.5 border-t border-white/5 mt-1.5 items-center justify-between">
                                <div className="flex gap-0.5 overflow-hidden">
                                  {item.subject.slice(0, 1).map((sub: string, sIdx: number) => (
                                    <span key={sIdx} className="px-1 bg-white/5 text-white/60 rounded text-[6px] uppercase font-bold truncate max-w-[45px]">
                                      {sub}
                                    </span>
                                  ))}
                                </div>
                                <a 
                                  href={`https://archive.org/details/${item.identifier}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[7px] text-pink-400 hover:underline flex items-center gap-0.5 font-bold cursor-pointer"
                                >
                                  Details ↗
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-24 gap-1.5 text-white/30 font-mono text-[9px]">
                          <FolderOpen className="w-3.5 h-3.5 text-white/10" />
                          <p>No matching backup clips found.</p>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              );
            })()
          )}
        </div>
      </div>

      {/* FULL WIDTH INSTRUCTIONAL GUIDE FOR THE SCRAPED NEWS SEGMENTS */}
      <div className="col-span-1 xl:col-span-3 bg-gradient-to-r from-purple-950/10 via-[#0f0f12] to-indigo-950/10 border border-white/5 rounded-2xl p-6 text-left space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/20">
            <Sparkles className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h4 className="text-sm font-black uppercase tracking-wider text-white">How to Watch Scraped News Segments</h4>
            <p className="text-[10px] text-white/40 uppercase font-mono mt-0.5">Integration and Playback Guide</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          
          <div className="bg-white/2 border border-white/5 rounded-xl p-4 space-y-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] font-mono font-bold">1</span>
            <h5 className="text-xs font-bold text-white uppercase tracking-wider">Where Segments are Loaded</h5>
            <p className="text-[11px] text-white/60 leading-relaxed font-sans">
              When the scraper completes, the harvested segments are mapped directly to a dedicated channel: <strong>Universal Retro Newsreels (CH 103)</strong> under the <strong>"News"</strong> category.
            </p>
          </div>

          <div className="bg-white/2 border border-white/5 rounded-xl p-4 space-y-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-mono font-bold">2</span>
            <h5 className="text-xs font-bold text-white uppercase tracking-wider">Automated Live Schedule</h5>
            <p className="text-[11px] text-white/60 leading-relaxed font-sans">
              Segments are automatically sequenced into 30-minute blocks aligned with the <strong>Virtual Broadcast Clock</strong>, ensuring real-time synchronized playback and live schedule tracks.
            </p>
          </div>

          <div className="bg-white/2 border border-white/5 rounded-xl p-4 space-y-2 flex flex-col justify-between">
            <div>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-mono font-bold">3</span>
              <h5 className="text-xs font-bold text-white uppercase tracking-wider mt-2">How to Watch & Tune In</h5>
              <p className="text-[11px] text-white/60 leading-relaxed font-sans mb-3">
                Press <strong>[M]</strong> to open the Channels Drawer, select the <strong>News</strong> category, and choose <strong>CH 103</strong>. Expand the TV Guide using <strong>[G]</strong> to see what is scheduled next!
              </p>
            </div>
            {onSelectChannel && (
              <button
                onClick={() => onSelectChannel('ch-news-archive')}
                className="w-full mt-2 py-2 px-3 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black text-[10px] uppercase tracking-wider rounded-lg font-mono flex items-center justify-center gap-1.5 transition-all shadow-[0_0_15px_rgba(220,38,38,0.2)] cursor-pointer"
              >
                <Play className="w-3 h-3 fill-current" />
                Tune In CH 104 Now
              </button>
            )}
          </div>

        </div>
      </div>

    </div>
  );
}
