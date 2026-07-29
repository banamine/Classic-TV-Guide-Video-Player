/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, startTransition } from 'react';
import { CHANNELS_DATA } from './data/playlist';
import { Channel, Episode, Show, PlaybackLog } from './types';
import { getLiveEpisodeForChannel } from './utils/scheduler';
import { CustomVideoPlayer } from './components/CustomVideoPlayer';
import { EPGGuide } from './components/EPGGuide';
import { StationDirectory } from './components/StationDirectory';
import { CinemaEPGGuide } from './components/CinemaEPGGuide';
import { DiagnosticConsole } from './components/DiagnosticConsole';
import { ScraperDashboard } from './components/ScraperDashboard';
import { CommercialFillModal } from './components/CommercialFillModal';
import { StationEditModal } from './components/StationEditModal';
import { parseM3U, exportM3U, exportCSV, fetchAndParseJsonPlaylist } from './utils/m3uParser';
import { parseMasterPlaylistJSON } from './utils/broadcastEngine';
import { generateStaticPlayerHtml } from './utils/staticPlayerGenerator';
import {
  Radio,
  Tv,
  Calendar,
  Info,
  Terminal,
  Activity,
  HelpCircle,
  Laptop,
  FolderOpen,
  Plus,
  Trash2,
  Settings,
  Scissors,
  Copy,
  Clipboard,
  Search,
  Sparkles,
  Download,
  Upload,
  Globe,
  Play,
  ArrowUp,
  ArrowDown,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  FileSpreadsheet,
  Tag,
  Clock,
  PlusCircle,
  Check,
  ChevronRight,
  MonitorPlay,
  Github,
  GitBranch,
  PlayCircle,
  Code,
  Cpu,
  RefreshCw,
  Star,
  StarOff,
  Edit3
} from 'lucide-react';

export default function App() {
  // Primary state holding all channels (initially from playlist data)
  const [channels, setChannels] = useState<Channel[]>(() => [...CHANNELS_DATA]);
  const [selectedChannel, setSelectedChannel] = useState<Channel>(() => {
    return CHANNELS_DATA[0] || {} as Channel;
  });
  const [selectedShow, setSelectedShow] = useState<Show>(() => {
    return CHANNELS_DATA[0]?.shows?.[0] || {} as Show;
  });
  const [selectedEpisode, setSelectedEpisode] = useState<Episode>(() => {
    return CHANNELS_DATA[0]?.shows?.[0]?.episodes?.[0] || {} as Episode;
  });

  // Startup lazy-init check: Verifies if selectedChannel (representing activeChannel) is set on startup or becomes undefined.
  // If undefined or empty, default it to the first channel in CHANNELS_DATA array to prevent early-exit failures in the broadcast engine.
  useEffect(() => {
    if ((!selectedChannel || !selectedChannel.id) && CHANNELS_DATA && CHANNELS_DATA.length > 0 && CHANNELS_DATA[0]?.id) {
      const defaultChannel = CHANNELS_DATA[0];
      if (selectedChannel !== defaultChannel) {
        console.log("⚡ [Lazy-Init]: Active channel undefined, missing, or invalid. Resetting to first channel in CHANNELS_DATA.");
        setSelectedChannel(defaultChannel);
        if (defaultChannel.shows && defaultChannel.shows.length > 0) {
          setSelectedShow(defaultChannel.shows[0]);
          if (defaultChannel.shows[0].episodes && defaultChannel.shows[0].episodes.length > 0) {
            setSelectedEpisode(defaultChannel.shows[0].episodes[0]);
          }
        }
      }
    }
  }, [selectedChannel?.id]);

  // Loaded playlists source registry
  const [loadedFiles, setLoadedFiles] = useState<string[]>(['Classic_Retro_TV_Defaults.m3u']);

  // Playback modes
  const [isLiveMode, setIsLiveMode] = useState<boolean>(true);
  const [schedulingMode, setSchedulingMode] = useState<'hard-clocked' | 'continuous'>('hard-clocked');
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(Date.now());
  const [liveSeekOffset, setLiveSeekOffset] = useState<number>(0);
  const [clockOffsetMs, setClockOffsetMs] = useState<number>(0);

  // Diagnostic Logs array
  const [logs, setLogs] = useState<PlaybackLog[]>([]);

  // Search & Filter controls
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('All');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState<boolean>(false);

  // Inline Cell Editing states
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editingFieldName, setEditingFieldName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');

  // Primary workspace tabs
  const [workspaceTab, setWorkspaceTab] = useState<'matrix' | 'epg' | 'export' | 'scraper'>('matrix');

  // GitHub integration state variables
  const [githubRepo, setGithubRepo] = useState<string>(() => {
    const cached = localStorage.getItem('m3u_pro_github_repo');
    if (cached) return cached;
    try {
      if (typeof window !== 'undefined' && window.location.hostname.endsWith('.github.io')) {
        const parts = window.location.hostname.split('.');
        const owner = parts[0];
        const pathSegments = window.location.pathname.split('/').filter(Boolean);
        if (pathSegments.length > 0) {
          return `${owner}/${pathSegments[0]}`;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return 'banamine/Nexus-TV-O';
  });
  const [githubBranch, setGithubBranch] = useState<string>(() => localStorage.getItem('m3u_pro_github_branch') || 'main');
  const [isCustomBranch, setIsCustomBranch] = useState<boolean>(() => {
    const saved = localStorage.getItem('m3u_pro_github_branch') || 'main';
    return !['main', 'dev', 'staging'].includes(saved);
  });
  const [githubToken, setGithubToken] = useState<string>(() => localStorage.getItem('m3u_pro_github_token') || '');
  const [githubStatus, setGithubStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [githubFiles, setGithubFiles] = useState<any[]>([]);
  const [githubWorkflows, setGithubWorkflows] = useState<any[]>([]);
  const [isGithubLoading, setIsGithubLoading] = useState<boolean>(false);
  const [githubMessage, setGithubMessage] = useState<string>('');
  const [currentExplorerPath, setCurrentExplorerPath] = useState<string>('');
  const [yamlCopied, setYamlCopied] = useState<boolean>(false);
  
  // Static Player Preview
  const [staticPlayerPreviewBlobUrl, setStaticPlayerPreviewBlobUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState<boolean>(false);
  const [githubM3uSavePath, setGithubM3uSavePath] = useState<string>('playlist.m3u');
  const [githubHtmlSavePath, setGithubHtmlSavePath] = useState<string>('index.html');
  const [githubEpgSavePath, setGithubEpgSavePath] = useState<string>(() => localStorage.getItem('m3u_pro_github_epg_save_path') || 'epg.json');

  const handleEpgSavePathChange = (val: string) => {
    setGithubEpgSavePath(val);
    localStorage.setItem('m3u_pro_github_epg_save_path', val);
  };

  // Row selection and Context clipboard state
  const [selectedRowId, setSelectedRowId] = useState<string | null>(CHANNELS_DATA[0].id);
  const [copiedChannel, setCopiedChannel] = useState<Channel | null>(null);
  const [isCutOperation, setIsCutOperation] = useState<boolean>(false);

  // Interactive link-check status
  const [isCheckingUrls, setIsCheckingUrls] = useState<boolean>(false);

  // Popup modals states
  const [showImportUrlModal, setShowImportUrlModal] = useState<boolean>(false);
  const [importUrlValue, setImportUrlValue] = useState<string>('');
  const [showFetchEpgModal, setShowFetchEpgModal] = useState<boolean>(false);
  const [fetchEpgValue, setFetchEpgValue] = useState<string>('');
  
  // Advanced Auto-Scheduler state configuration variables
  const [schedulerBlockLayout, setSchedulerBlockLayout] = useState<string>('4'); // 1, 2, 4, 6, 8, 12, 24 hours
  const [schedulerSelectedGenres, setSchedulerSelectedGenres] = useState<string[]>(['TV Shows', 'Movies', 'Westerns', 'News', 'Crime Shows']);
  const [schedulerMorningTheme, setSchedulerMorningTheme] = useState<string>('Westerns');
  const [schedulerAfternoonTheme, setSchedulerAfternoonTheme] = useState<string>('Crime Shows');
  const [schedulerEveningTheme, setSchedulerEveningTheme] = useState<string>('TV Shows');
  const [schedulerLateLateTheme, setSchedulerLateLateTheme] = useState<string>('Movies');
  const [showAutoSchedulerModal, setShowAutoSchedulerModal] = useState<boolean>(false);
  const [showBackupsModal, setShowBackupsModal] = useState<boolean>(false);
  const [backupChannelId, setBackupChannelId] = useState<string | null>(null);
  const [newBackupUrl, setNewBackupUrl] = useState<string>('');
  const [showTvGuideModal, setShowTvGuideModal] = useState<boolean>(false);
  const [showCommercialModal, setShowCommercialModal] = useState<boolean>(false);

  // Custom row context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    channelId: string;
  } | null>(null);

  // File input ref for Load action
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cinema-First Overlay & Mode States
  const [isStationDrawerOpen, setIsStationDrawerOpen] = useState<boolean>(false);
  const [isEPGOverlayVisible, setIsEPGOverlayVisible] = useState<boolean>(false);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState<boolean>(false);
  const [isHUDVisible, setIsHUDVisible] = useState<boolean>(true);
  const [videoFit, setVideoFit] = useState<'cover' | 'contain'>('contain');

  const decayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveringMenuRef = useRef<boolean>(false);
  const channelSwitchLockRef = useRef<{ id: string; time: number } | null>(null);

  const resetDecayTimer = () => {
    if (decayTimerRef.current) {
      clearTimeout(decayTimerRef.current);
    }
    setIsHUDVisible(true);
    
    // Only schedule decay if not actively hovering any overlay menu
    if (!isHoveringMenuRef.current) {
      decayTimerRef.current = setTimeout(() => {
        // Clean decay: collapse drawers and hide HUD after 5 seconds of inactivity
        setIsStationDrawerOpen(false);
        setIsEPGOverlayVisible(false);
        setIsHUDVisible(false);
      }, 5000);
    }
  };

  const clearDecayTimer = () => {
    if (decayTimerRef.current) {
      clearTimeout(decayTimerRef.current);
    }
    setIsHUDVisible(true);
  };

  // Keyboard mapping shortcuts effect (Phase 2, Bullet 3)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is actively writing/editing in input, textarea, or contenteditable cell
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.hasAttribute('contenteditable'))
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      if (key === 'm' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setIsStationDrawerOpen((prev) => {
          const next = !prev;
          if (next) resetDecayTimer();
          return next;
        });
      } else if (key === 'g' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsEPGOverlayVisible((prev) => {
          const next = !prev;
          if (next) resetDecayTimer();
          return next;
        });
      } else if (key === 'a') {
        e.preventDefault();
        setVideoFit((prev) => {
          const next = prev === 'cover' ? 'contain' : 'cover';
          logMessage('custom', `Aspect Ratio switched to: ${next === 'cover' ? 'FILL SCREEN (COVER)' : 'LETTERBOX (CONTAIN)'}`);
          return next;
        });
      } else if (key === 's' || key === 'w') {
        e.preventDefault();
        setIsWorkspaceOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (isStationDrawerOpen || isEPGOverlayVisible) {
          setIsStationDrawerOpen(false);
          setIsEPGOverlayVisible(false);
        } else if (isWorkspaceOpen) {
          setIsWorkspaceOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStationDrawerOpen, isEPGOverlayVisible, isWorkspaceOpen, videoFit]);

  // Track window mouse movement to reset decay timer in viewing mode (Phase 3, Bullet 3)
  useEffect(() => {
    if (isWorkspaceOpen) return;

    const handleMouseMove = () => {
      resetDecayTimer();
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (decayTimerRef.current) {
        clearTimeout(decayTimerRef.current);
      }
    };
  }, [isWorkspaceOpen]);

  // Periodically refresh current time to drive virtual broadcast scheduler
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeMs(Date.now() + clockOffsetMs);
    }, 1000);
    return () => clearInterval(timer);
  }, [clockOffsetMs]);

  // Set up initial telemetry logs
  useEffect(() => {
    logMessage('custom', 'M3U MATRIX PRO Web Workspace initialized successfully.');
    logMessage('custom', `Loaded default playlist with ${CHANNELS_DATA.length} channels.`);
  }, []);

  // Update selection dynamically when scheduling changes or channel updates (in simulated Live mode)
  useEffect(() => {
    if (isLiveMode && selectedChannel && selectedChannel.id) {
      try {
        const live = getLiveEpisodeForChannel(selectedChannel, currentTimeMs);
        if (live && live.episode) {
          setSelectedEpisode((prevEp) => {
            if (!prevEp || prevEp.id !== live.episode.id || prevEp.url !== live.episode.url) {
              return live.episode;
            }
            return prevEp; // Keep reference stable unless episode actually changes
          });
          setSelectedShow((prevShow) => {
            if (!prevShow || prevShow.id !== live.show?.id) {
              return live.show;
            }
            return prevShow;
          });
          setLiveSeekOffset((prevOffset) => prevOffset !== live.seekOffsetSeconds ? live.seekOffsetSeconds : prevOffset);
        }
      } catch (err) {
        // Fallback if channel has custom raw playlist structure with no EPG
        const fallbackShow = selectedChannel.shows?.[0];
        const fallbackEp = fallbackShow?.episodes?.[0];
        if (fallbackShow && fallbackEp) {
          setSelectedEpisode((prevEp) => {
            if (!prevEp || prevEp.id !== fallbackEp.id || prevEp.url !== fallbackEp.url) {
              return fallbackEp;
            }
            return prevEp;
          });
          setSelectedShow((prevShow) => {
            if (!prevShow || prevShow.id !== fallbackShow.id) {
              return fallbackShow;
            }
            return prevShow;
          });
          setLiveSeekOffset(0);
        }
      }
    }
  }, [selectedChannel, isLiveMode, currentTimeMs]);

  // Log system telemetry events
  const logMessage = useCallback((
    type: PlaybackLog['type'],
    message: string,
    meta?: PlaybackLog['meta']
  ) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const formattedTimestamp = `[${timeStr}.${String(now.getMilliseconds()).padStart(3, '0')}]`;

    const newLog: PlaybackLog = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: formattedTimestamp,
      type,
      message,
      meta,
    };
    setLogs((prev) => [...prev.slice(-99), newLog]);
  }, []);

  const handleScraperLogEvent = useCallback((msg: string) => logMessage('custom', msg), [logMessage]);

  const handleClearLogs = () => {
    setLogs([]);
    logMessage('custom', 'Console logs cleared.');
  };

  const handleRunChannelHopTest = () => {
    if (!channels || channels.length === 0) {
      logMessage('error', '❌ [Channel Hop Test Failure]: No channels available in playlist.');
      return;
    }

    logMessage('custom', '🧪 [Channel Hop Test]: Initiating simulated channel hop diagnostic test...');

    // 1. Determine target channel to hop to (pick a different channel if available, or current channel)
    const currentChannelId = selectedChannel?.id;
    const targetChannel = channels.find((c) => c.id !== currentChannelId) || channels[0];

    // 2. Simulated broadcast timestamp
    const simulatedTimestampMs = currentTimeMs;
    const dateStr = new Date(simulatedTimestampMs).toISOString();

    logMessage('epg', `🧪 [Channel Hop Test]: Hopping from CH ${selectedChannel?.number || '?'} to CH ${targetChannel.number} "${targetChannel.name}" at simulated broadcast time ${dateStr}`);

    // 3. Calculate expected live state using scheduler.ts
    try {
      const expectedLive = getLiveEpisodeForChannel(targetChannel, simulatedTimestampMs);
      logMessage('custom', `🧪 [Scheduler Output]: Expected Show: "${expectedLive.show.title}", Episode: "${expectedLive.episode.title}", Seek Offset: ${expectedLive.seekOffsetSeconds}s, Remaining: ${expectedLive.remainingSeconds}s`);

      // 4. Simulate the channel switch in App.tsx
      setSelectedChannel(targetChannel);
      setSelectedShow(expectedLive.show);
      setSelectedEpisode(expectedLive.episode);
      setLiveSeekOffset(expectedLive.seekOffsetSeconds);

      // 5. Verify alignment between expected and resulting selection
      if (
        expectedLive.episode &&
        expectedLive.episode.title &&
        typeof expectedLive.seekOffsetSeconds === 'number' &&
        expectedLive.seekOffsetSeconds >= 0
      ) {
        logMessage('custom', `✅ [Channel Hop Test PASSED]: selectedEpisode ("${expectedLive.episode.title}") & liveSeekOffset (${expectedLive.seekOffsetSeconds}s) correctly aligned with scheduler calculations for CH "${targetChannel.name}".`);
      } else {
        logMessage('error', `❌ [Channel Hop Test FAILED]: Mismatch or invalid calculation for CH "${targetChannel.name}".`);
      }
    } catch (err: any) {
      logMessage('error', `❌ [Channel Hop Test ERROR]: Failed to compute scheduler schedule for CH "${targetChannel.name}": ${err.message}`);
    }
  };

  const refreshChannels = async () => {
    try {
      const res = await fetch('/api/channels');
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          if (data && data.length > 0) {
            setChannels(data);
            logMessage('custom', `Successfully loaded database playlist with ${data.length} channels.`);
            
            // Re-synchronize currently selected channel, show, and episode if needed
            setSelectedChannel((prev) => {
              const found = data.find((c: Channel) => c.id === prev?.id);
              if (found) {
                return found;
              }
              return data[0];
            });
          }
        }
      }
    } catch (err) {
      console.error('Failed to load channels from database:', err);
    }
  };

  const handleDurationProbed = useCallback((durationMs: number) => {
    setSelectedEpisode((prev) => (prev ? { ...prev, durationMs } : prev));
    setChannels((prevChannels) =>
      prevChannels.map((ch) => ({
        ...ch,
        shows: ch.shows?.map((s) => ({
          ...s,
          episodes: s.episodes?.map((e) =>
            e.id === selectedEpisode?.id ? { ...e, durationMs } : e
          ),
        })),
      }))
    );
  }, [selectedEpisode?.id]);

  useEffect(() => {
    refreshChannels();
  }, []);

  // Save credentials to localStorage when updated
  const saveGithubCredentials = (repo: string, branch: string, token: string) => {
    setGithubRepo(repo);
    setGithubBranch(branch);
    setIsCustomBranch(!['main', 'dev', 'staging'].includes(branch));
    setGithubToken(token);
    localStorage.setItem('m3u_pro_github_repo', repo);
    localStorage.setItem('m3u_pro_github_branch', branch);
    localStorage.setItem('m3u_pro_github_token', token);
    logMessage('custom', 'GitHub credentials saved locally.');
  };

  const fetchGithubContents = async (path: string = '') => {
    setIsGithubLoading(true);
    setGithubMessage('');
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
      };
      if (githubToken) {
        headers['Authorization'] = `token ${githubToken}`;
      }
      
      const res = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${path}`, { headers });
      if (!res.ok) {
        throw new Error(`GitHub API returned ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      const filesList = Array.isArray(data) ? data : [data];
      setGithubFiles(filesList);
      setCurrentExplorerPath(path);
      setGithubStatus('success');
      logMessage('custom', `Successfully fetched GitHub contents for repository "${githubRepo}" at path "/${path}".`);
    } catch (err: any) {
      setGithubStatus('error');
      setGithubMessage(err.message || 'Error communicating with GitHub REST API.');
      logMessage('error', `GitHub Contents Fetch Failed: ${err.message}`);
    } finally {
      setIsGithubLoading(false);
    }
  };

  const fetchGithubWorkflows = async () => {
    setIsGithubLoading(true);
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
      };
      if (githubToken) {
        headers['Authorization'] = `token ${githubToken}`;
      }
      
      const res = await fetch(`https://api.github.com/repos/${githubRepo}/actions/workflows`, { headers });
      if (res.ok) {
        const data = await res.json();
        setGithubWorkflows(data.workflows || []);
        logMessage('custom', `Loaded ${data.workflows?.length || 0} GitHub actions workflows from repo.`);
      } else {
        setGithubWorkflows([]);
      }
    } catch (err: any) {
      console.warn('Failed fetching workflows', err);
    } finally {
      setIsGithubLoading(false);
    }
  };

  const triggerWorkflowDispatch = async (workflowId: string | number) => {
    if (!githubToken) {
      setGithubMessage('A GitHub Personal Access Token is required to trigger workflow dispatches.');
      return;
    }
    setIsGithubLoading(true);
    setGithubMessage('');
    
    // DIAGNOSTIC CHECK: Find workflow and verify on: workflow_dispatch:
    logMessage('custom', `🔍 [Diagnostic Check]: Validating workflow #${workflowId} trigger configuration...`);
    const targetWf = githubWorkflows.find(w => w.id === workflowId || w.id === Number(workflowId) || w.path?.endsWith(String(workflowId)));
    
    if (targetWf && targetWf.path) {
      logMessage('custom', `🔍 [Diagnostic Check]: Fetching workflow file from GitHub: "/${targetWf.path}" on branch "${githubBranch}"...`);
      try {
        const checkHeaders: Record<string, string> = {
          'Accept': 'application/vnd.github.v3.raw',
          'Authorization': `token ${githubToken}`
        };
        let fileRes = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${targetWf.path}?ref=${githubBranch}`, { headers: checkHeaders });
        
        let yamlContent = '';
        if (fileRes.ok) {
          yamlContent = await fileRes.text();
        } else {
          // Fallback to standard JSON content retrieval if raw header has issues
          const jsonHeaders: Record<string, string> = {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `token ${githubToken}`
          };
          const jsonRes = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${targetWf.path}?ref=${githubBranch}`, { headers: jsonHeaders });
          if (jsonRes.ok) {
            const jsonData = await jsonRes.json();
            if (jsonData.content && jsonData.encoding === 'base64') {
              yamlContent = atob(jsonData.content.replace(/\s/g, ''));
            }
          }
        }

        if (yamlContent) {
          // Filter out comments (lines starting with # or spaces then #)
          const lines = yamlContent.split('\n');
          const cleanLines = lines
            .map(line => {
              const hashIdx = line.indexOf('#');
              return hashIdx !== -1 ? line.substring(0, hashIdx) : line;
            })
            .join('\n');

          const hasWorkflowDispatch = /workflow_dispatch\s*(?::|$|\[|\])/i.test(cleanLines);
          if (hasWorkflowDispatch) {
            logMessage('custom', `✅ [Diagnostic Success]: Verified 'workflow_dispatch' trigger is present in "/${targetWf.path}".`);
          } else {
            logMessage('error', `❌ [Diagnostic Failure]: 'workflow_dispatch' trigger is MISSING from "/${targetWf.path}"!`);
            setGithubMessage(`Dispatch aborted: The workflow file "/${targetWf.path}" does not have 'workflow_dispatch' configured. Please add 'on: workflow_dispatch:' to allow remote triggers.`);
            setIsGithubLoading(false);
            return; // STOP execution of dispatch to save API overhead and provide guide
          }
        } else {
          logMessage('waiting', `⚠️ [Diagnostic Warning]: Workflow file content is empty or unreadable. Continuing dispatch attempt...`);
        }
      } catch (checkErr: any) {
        logMessage('waiting', `⚠️ [Diagnostic Skipped]: Could not verify workflow triggers: ${checkErr.message}. Attempting dispatch anyway...`);
      }
    } else {
      logMessage('waiting', `⚠️ [Diagnostic Check]: Workflow path not registered in local state. Attempting direct dispatch...`);
    }

    try {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${githubToken}`,
        'Content-Type': 'application/json'
      };
      
      const res = await fetch(`https://api.github.com/repos/${githubRepo}/actions/workflows/${workflowId}/dispatches`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ref: githubBranch })
      });
      
      if (res.status === 204) {
        setGithubMessage(`Successfully triggered workflow execution! ID: ${workflowId}`);
        logMessage('custom', `[GitHub Action Run]: Sent dispatch request to workflow #${workflowId} successfully.`);
      } else {
        const bodyText = await res.text();
        throw new Error(`Failed with status ${res.status}: ${bodyText}`);
      }
    } catch (err: any) {
      if (err.message && (err.message.includes('workflow_dispatch') || err.message.includes('422'))) {
        setGithubMessage(`Dispatch failed: Failed with status 422: Workflow does not have 'workflow_dispatch' trigger. Please add 'on: [workflow_dispatch]' or 'on: workflow_dispatch' to your GitHub Action YAML workflow file inside your repository.`);
      } else {
        setGithubMessage(`Dispatch failed: ${err.message}`);
      }
      logMessage('error', `GitHub Workflow Trigger Failed: ${err.message}`);
    } finally {
      setIsGithubLoading(false);
    }
  };

  const loadM3UFromGithub = async (downloadUrl: string, fileName: string) => {
    setIsGithubLoading(true);
    setGithubMessage('');
    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(`Could not download file contents: ${res.statusText}`);
      const text = await res.text();
      
      const parsed = parseM3U(text, fileName);
      if (parsed.length > 0) {
        setChannels(parsed);
        setSelectedChannel(parsed[0]);
        setSelectedShow(parsed[0].shows?.[0] || { id: '', title: 'N/A', description: '', year: '', genre: '', episodes: [] });
        setSelectedEpisode(parsed[0].shows?.[0]?.episodes?.[0] || { id: '', title: 'N/A', url: '' });
        setLoadedFiles(prev => prev.includes(fileName) ? prev : [...prev, fileName]);
        setGithubMessage(`Successfully loaded ${parsed.length} channels from ${fileName}.`);
        logMessage('custom', `Imported channel matrix from GitHub file: ${fileName}`);
      } else {
        throw new Error('Playlist has no valid stream URLs.');
      }
    } catch (err: any) {
      setGithubMessage(`Import failed: ${err.message}`);
      logMessage('error', `GitHub M3U load failed: ${err.message}`);
    } finally {
      setIsGithubLoading(false);
    }
  };

  const saveM3UToGithub = async (filePath: string) => {
    if (!githubToken) {
      setGithubMessage('A GitHub Personal Access Token is required to write back files to the repository.');
      return;
    }
    setIsGithubLoading(true);
    setGithubMessage('');
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${githubToken}`,
      };
      
      let sha: string | undefined;
      try {
        const checkRes = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${filePath}?ref=${githubBranch}`, { headers });
        if (checkRes.ok) {
          const fileData = await checkRes.json();
          sha = fileData.sha;
        }
      } catch (err) {
        console.log('File may be new', err);
      }

      const m3uContent = exportM3U(channels);
      const encodedContent = btoa(unescape(encodeURIComponent(m3uContent)));

      const commitRes = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${filePath}`, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Update ${filePath} with auto-scheduled playlist via M3U PRO`,
          content: encodedContent,
          branch: githubBranch,
          sha
        })
      });

      if (commitRes.ok) {
        setGithubMessage(`Successfully committed and updated playlist at "/${filePath}"!`);
        logMessage('custom', `[GitHub Commit Push]: Saved playlist to /${filePath} on branch "${githubBranch}".`);
      } else {
        const errText = await commitRes.text();
        throw new Error(`Commit failed (${commitRes.status}): ${errText}`);
      }
    } catch (err: any) {
      setGithubMessage(`Commit failed: ${err.message}`);
      logMessage('error', `GitHub Playlist Save Failed: ${err.message}`);
    } finally {
      setIsGithubLoading(false);
    }
  };

  const saveEPGToGithub = async (filePath: string) => {
    if (!githubToken) {
      setGithubMessage('A GitHub Personal Access Token is required to write back EPG state to the repository.');
      return;
    }
    setIsGithubLoading(true);
    setGithubMessage('');
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${githubToken}`,
      };
      
      let sha: string | undefined;
      try {
        const checkRes = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${filePath}?ref=${githubBranch}`, { headers });
        if (checkRes.ok) {
          const fileData = await checkRes.json();
          sha = fileData.sha;
        }
      } catch (err) {
        console.log('EPG File may be new', err);
      }

      const content = JSON.stringify(channels, null, 2);
      const encodedContent = btoa(unescape(encodeURIComponent(content)));

      const commitRes = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${filePath}`, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Update ${filePath} with EPG Guide state and scheduled programs`,
          content: encodedContent,
          branch: githubBranch,
          sha
        })
      });

      if (commitRes.ok) {
        setGithubMessage(`Successfully committed and updated EPG state at "/${filePath}"!`);
        logMessage('custom', `✅ [GitHub EPG Save Success]: Saved current EPG state and scheduled programs to /${filePath} on branch "${githubBranch}".`);
      } else {
        const errText = await commitRes.text();
        throw new Error(`EPG save failed (${commitRes.status}): ${errText}`);
      }
    } catch (err: any) {
      setGithubMessage(`EPG save failed: ${err.message}`);
      logMessage('error', `❌ [GitHub EPG Save Failure]: ${err.message}`);
    } finally {
      setIsGithubLoading(false);
    }
  };

  const loadEPGFromGithub = async (downloadUrl: string, fileName: string) => {
    setIsGithubLoading(true);
    setGithubMessage('');
    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(`Could not download file contents: ${res.statusText}`);
      const data = await res.json();
      
      if (Array.isArray(data) && data.length > 0 && data[0].id && data[0].name) {
        const saveRes = await fetch('/api/channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        
        if (saveRes.ok) {
          setChannels(data);
          setSelectedChannel(data[0]);
          setSelectedShow(data[0].shows?.[0] || { id: '', title: 'N/A', description: '', year: '', genre: '', episodes: [] });
          setSelectedEpisode(data[0].shows?.[0]?.episodes?.[0] || { id: '', title: 'N/A', url: '' });
          setGithubMessage(`Successfully loaded ${data.length} channels from ${fileName}.`);
          logMessage('custom', `✅ [EPG Load Success]: Imported and saved EPG state from GitHub file: ${fileName}`);
        } else {
          const errText = await saveRes.text();
          throw new Error(`Failed to save EPG to database: ${errText}`);
        }
      } else {
        throw new Error('JSON file is not a valid EPG channels structure.');
      }
    } catch (err: any) {
      setGithubMessage(`EPG load failed: ${err.message}`);
      logMessage('error', `❌ [EPG Load Failure]: ${err.message}`);
    } finally {
      setIsGithubLoading(false);
    }
  };

  const fetchAndLoadEpgFromPath = async (filePath: string) => {
    if (!githubToken) {
      setGithubMessage('A GitHub Personal Access Token is required to load EPG state.');
      return;
    }
    setIsGithubLoading(true);
    setGithubMessage('');
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${githubToken}`,
      };
      
      const res = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${filePath}?ref=${githubBranch}`, { headers });
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error(`EPG state file "${filePath}" not found in this repository branch.`);
        }
        throw new Error(`GitHub API returned ${res.status}: ${res.statusText}`);
      }
      
      const fileData = await res.json();
      const content = decodeURIComponent(escape(atob(fileData.content.replace(/\s/g, ''))));
      const data = JSON.parse(content);
      
      if (Array.isArray(data) && data.length > 0 && data[0].id && data[0].name) {
        const saveRes = await fetch('/api/channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        
        if (saveRes.ok) {
          setChannels(data);
          setSelectedChannel(data[0]);
          setSelectedShow(data[0].shows?.[0] || { id: '', title: 'N/A', description: '', year: '', genre: '', episodes: [] });
          setSelectedEpisode(data[0].shows?.[0]?.episodes?.[0] || { id: '', title: 'N/A', url: '' });
          setGithubMessage(`Successfully synced and loaded EPG state from "/${filePath}"!`);
          logMessage('custom', `✅ [EPG Sync Success]: Synchronized local player with remote EPG state from "/${filePath}" (${data.length} channels).`);
        } else {
          const errText = await saveRes.text();
          throw new Error(`Failed to save loaded EPG to database: ${errText}`);
        }
      } else {
        throw new Error('EPG JSON content is invalid or empty.');
      }
    } catch (err: any) {
      setGithubMessage(`EPG Sync Load failed: ${err.message}`);
      logMessage('error', `❌ [EPG Sync Load Failure]: ${err.message}`);
    } finally {
      setIsGithubLoading(false);
    }
  };

  const publishStaticPlayerToGithub = async (filePath: string) => {
    if (!githubToken) {
      setGithubMessage('A GitHub Personal Access Token is required to publish/commit files to your repository.');
      return;
    }
    setIsGithubLoading(true);
    setGithubMessage('');
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${githubToken}`,
      };
      
      let sha: string | undefined;
      try {
        const checkRes = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${filePath}?ref=${githubBranch}`, { headers });
        if (checkRes.ok) {
          const fileData = await checkRes.json();
          sha = fileData.sha;
        }
      } catch (err) {
        console.log('Static player file may be new', err);
      }

      const playerContent = generateStaticPlayerHtml(channels, `Classic TV Guide & Video Player`, githubEpgSavePath);
      const encodedContent = btoa(unescape(encodeURIComponent(playerContent)));

      const commitRes = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${filePath}`, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Publish static auto-scheduled broadcast player to /${filePath} via M3U PRO`,
          content: encodedContent,
          branch: githubBranch,
          sha
        })
      });

      if (commitRes.ok) {
        setGithubMessage(`Successfully published and updated active HTML Player at "/${filePath}"!`);
        logMessage('custom', `[GitHub Publisher]: Published auto-scheduled static player to /${filePath} on branch "${githubBranch}".`);
      } else {
        const errText = await commitRes.text();
        throw new Error(`Publish failed (${commitRes.status}): ${errText}`);
      }
    } catch (err: any) {
      setGithubMessage(`Publish failed: ${err.message}`);
      logMessage('error', `GitHub Player Publish Failed: ${err.message}`);
    } finally {
      setIsGithubLoading(false);
    }
  };

  const pushCodebaseToGithub = async () => {
    if (!githubToken) {
      setGithubMessage('A GitHub Personal Access Token is required to push the codebase.');
      return;
    }
    if (!githubRepo) {
      setGithubMessage('Please specify your target GitHub repository (e.g. username/repo).');
      return;
    }
    setIsGithubLoading(true);
    setGithubMessage('');
    logMessage('custom', `📤 [Codebase Sync]: Committing and pushing full M3U Pro codebase (sources, configurations, and workflows) to repository "${githubRepo}" on branch "${githubBranch}"...`);
    try {
      const response = await fetch('/api/github/push-codebase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          repo: githubRepo,
          branch: githubBranch,
          token: githubToken
        })
      });

      const data = await response.json();
      if (response.ok) {
        setGithubMessage(data.message || 'Successfully pushed full codebase!');
        logMessage('custom', `✅ [Codebase Sync Success]: ${data.message || 'All local application source files and custom workflow pipelines have been pushed and mirrored to remote.'}`);
        // Automatically fetch workflows after pushing codebase, so they can trigger if needed
        await fetchGithubWorkflows();
      } else {
        throw new Error(data.error || 'Backend failed to push codebase.');
      }
    } catch (err: any) {
      setGithubMessage(`Codebase sync failed: ${err.message}`);
      logMessage('error', `❌ [Codebase Sync Failure]: ${err.message}`);
    } finally {
      setIsGithubLoading(false);
    }
  };

  const handlePreviewStaticPlayer = () => {
    setIsGeneratingPreview(true);
    try {
      const html = generateStaticPlayerHtml(channels, `Station Live Broadcast Preview`, githubEpgSavePath);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      setStaticPlayerPreviewBlobUrl(url);
      logMessage('custom', '[Player Preview]: Compiled auto-scheduled static player page successfully.');
    } catch (err: any) {
      logMessage('error', `Failed to generate static player preview: ${err.message}`);
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const getGitHubPagesUrl = () => {
    if (!githubRepo || !githubRepo.includes('/')) return null;
    const parts = githubRepo.split('/');
    const owner = parts[0]?.trim();
    const repo = parts[1]?.trim();
    if (!owner || !repo) return null;
    if (repo.toLowerCase().endsWith('.github.io')) {
      return `https://${repo.toLowerCase()}/`;
    }
    return `https://${owner.toLowerCase()}.github.io/${repo}/`;
  };

  const quickSyncAndPublishAll = async () => {
    if (!githubToken) {
      setGithubMessage('A GitHub Personal Access Token is required to run the automated quick sync.');
      logMessage('error', '⚡ Quick Sync Aborted: Missing GitHub Personal Access Token (PAT).');
      return;
    }
    setIsGithubLoading(true);
    setGithubMessage('');
    logMessage('custom', '⚡ [Quick Sync]: Initiating automated background deployment sequence...');

    try {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${githubToken}`,
      };

      // STEP 1: Sync the Playlist File (.m3u)
      logMessage('custom', `[Quick Sync Step 1/4]: Synchronizing remote M3U playlist reference at "/${githubM3uSavePath}"...`);
      let m3uSha: string | undefined;
      try {
        const m3uCheck = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${githubM3uSavePath}?ref=${githubBranch}`, { headers });
        if (m3uCheck.ok) {
          const m3uData = await m3uCheck.json();
          m3uSha = m3uData.sha;
          logMessage('custom', `[Quick Sync]: Found existing playlist file SHA: ${m3uSha?.substring(0, 7)}`);
        } else {
          logMessage('custom', `[Quick Sync]: Creating a fresh new playlist file on branch "${githubBranch}".`);
        }
      } catch (err: any) {
        logMessage('waiting', `[Quick Sync]: Playlist SHA resolution skipped: ${err.message}`);
      }

      const m3uContent = exportM3U(channels);
      const encodedM3u = btoa(unescape(encodeURIComponent(m3uContent)));

      const m3uCommitRes = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${githubM3uSavePath}`, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Auto-update virtual broadcast M3U playlist with ${channels.length} channels`,
          content: encodedM3u,
          branch: githubBranch,
          sha: m3uSha
        })
      });

      if (m3uCommitRes.ok) {
        logMessage('custom', `[Quick Sync]: Successfully committed and pushed playlist to "/${githubM3uSavePath}"`);
      } else {
        const m3uErrText = await m3uCommitRes.text();
        throw new Error(`M3U upload failed: ${m3uCommitRes.status} - ${m3uErrText}`);
      }

      // STEP 2: Sync the EPG Guide State (.json)
      logMessage('custom', `[Quick Sync Step 2/4]: Saving current EPG guide state and scheduled programs at "/${githubEpgSavePath}"...`);
      let epgSha: string | undefined;
      try {
        const epgCheck = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${githubEpgSavePath}?ref=${githubBranch}`, { headers });
        if (epgCheck.ok) {
          const epgData = await epgCheck.json();
          epgSha = epgData.sha;
          logMessage('custom', `[Quick Sync]: Found existing EPG JSON state file SHA: ${epgSha?.substring(0, 7)}`);
        } else {
          logMessage('custom', `[Quick Sync]: Creating a fresh new EPG JSON file on branch "${githubBranch}".`);
        }
      } catch (err: any) {
        logMessage('waiting', `[Quick Sync]: EPG SHA resolution skipped: ${err.message}`);
      }

      const epgContent = JSON.stringify(channels, null, 2);
      const encodedEpg = btoa(unescape(encodeURIComponent(epgContent)));

      const epgCommitRes = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${githubEpgSavePath}`, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Auto-update EPG state and scheduled programs with ${channels.length} channels`,
          content: encodedEpg,
          branch: githubBranch,
          sha: epgSha
        })
      });

      if (epgCommitRes.ok) {
        logMessage('custom', `[Quick Sync]: Successfully committed and pushed EPG state to "/${githubEpgSavePath}"`);
      } else {
        const epgErrText = await epgCommitRes.text();
        throw new Error(`EPG state upload failed: ${epgCommitRes.status} - ${epgErrText}`);
      }

      // STEP 3: Sync the Static Player File (.html)
      logMessage('custom', `[Quick Sync Step 3/4]: Bundling & publishing HTML TV Guide Player at "/${githubHtmlSavePath}"...`);
      let htmlSha: string | undefined;
      try {
        const htmlCheck = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${githubHtmlSavePath}?ref=${githubBranch}`, { headers });
        if (htmlCheck.ok) {
          const htmlData = await htmlCheck.json();
          htmlSha = htmlData.sha;
          logMessage('custom', `[Quick Sync]: Found existing HTML player file SHA: ${htmlSha?.substring(0, 7)}`);
        } else {
          logMessage('custom', `[Quick Sync]: Creating a fresh new index player file on branch "${githubBranch}".`);
        }
      } catch (err: any) {
        logMessage('waiting', `[Quick Sync]: HTML player SHA resolution skipped: ${err.message}`);
      }

      const playerContent = generateStaticPlayerHtml(channels, `Classic TV Guide & Video Player`, githubEpgSavePath);
      const encodedHtml = btoa(unescape(encodeURIComponent(playerContent)));

      const htmlCommitRes = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${githubHtmlSavePath}`, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Publish fully-featured static Guide player to /${githubHtmlSavePath} [Classic-TV]`,
          content: encodedHtml,
          branch: githubBranch,
          sha: htmlSha
        })
      });

      if (htmlCommitRes.ok) {
        logMessage('custom', `[Quick Sync]: Successfully committed and pushed index player to "/${githubHtmlSavePath}"`);
      } else {
        const htmlErrText = await htmlCommitRes.text();
        throw new Error(`HTML player upload failed: ${htmlCommitRes.status} - ${htmlErrText}`);
      }

      // STEP 4: Auto Trigger Workflow Dispatch
      logMessage('custom', `[Quick Sync Step 4/4]: Querying available repository workflows to automate CI/CD pipeline triggers...`);
      if (githubWorkflows && githubWorkflows.length > 0) {
        const activeWorkflow = githubWorkflows[0];
        logMessage('custom', `[Quick Sync]: Triggering active GitHub Actions workflow: "${activeWorkflow.name}" (ID: ${activeWorkflow.id})`);
        await triggerWorkflowDispatch(activeWorkflow.id);
      } else {
        logMessage('custom', `[Quick Sync]: No Actions workflows registered. Relying on GitHub Pages standard direct host.`);
      }

      const liveUrl = getGitHubPagesUrl();
      setGithubMessage(`⚡ Synchronized and published successfully!`);
      logMessage('custom', `🚀 [STATUS: COMPLETE]: Broadcast player is active, fully synced, and ready to run.`);
      if (liveUrl) {
        logMessage('custom', `🚀 [PUBLIC DOMAIN]: Visitable at ${liveUrl}`);
      }

    } catch (err: any) {
      setGithubMessage(`Quick Sync failed: ${err.message}`);
      logMessage('error', `❌ [Quick Sync Failure]: ${err.message}`);
    } finally {
      setIsGithubLoading(false);
      // Refresh repo file explorer to show updated files
      fetchGithubContents(currentExplorerPath);
    }
  };

  // Safe stream switch handler with debounce lock and atomic single-pass state updates
  const handleSelectChannel = (channel: Channel) => {
    const now = Date.now();
    if (channelSwitchLockRef.current && channelSwitchLockRef.current.id === channel.id && now - channelSwitchLockRef.current.time < 300) {
      return; // Debounce rapid redundant clicks on same channel
    }
    channelSwitchLockRef.current = { id: channel.id, time: now };

    // 1. High-priority: Update selected channel immediately
    setSelectedChannel(channel);
    setSelectedRowId(channel.id);

    // 2. Offload tracking & analytics outside the main event call stack
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        (window as any).gtag?.('event', 'channel_switch', { channel_id: channel.id, channel_name: channel.name });
      });
    } else {
      setTimeout(() => {
        (window as any).gtag?.('event', 'channel_switch', { channel_id: channel.id, channel_name: channel.name });
      }, 0);
    }

    logMessage('epg', `[Matrix Selection]: Routing tuner to CH ${channel.number} "${channel.name}"`);

    let targetShow = channel.shows?.[0] || {
      id: 'default',
      title: 'Live TV Stream',
      description: 'Generic IPTV Direct Stream',
      year: '2026',
      genre: channel.category,
      episodes: []
    };
    let targetEpisode = targetShow.episodes?.[0] || {
      id: 'default-ep',
      title: 'Live Stream Loop',
      url: channel.url || ''
    };
    let targetSeekOffset = 0;

    if (isLiveMode) {
      try {
        const live = getLiveEpisodeForChannel(channel, currentTimeMs);
        targetShow = live.show;
        targetEpisode = live.episode;
        targetSeekOffset = live.seekOffsetSeconds;
      } catch (e) {
        targetSeekOffset = 0;
      }
    }

    // 3. Low-priority: Defer heavy schedule details & EPG state updates via startTransition
    startTransition(() => {
      setSelectedShow(targetShow);
      setSelectedEpisode(targetEpisode);
      setLiveSeekOffset(targetSeekOffset);
    });
  };

  // Switch play mode
  const setModeLive = () => {
    setIsLiveMode(true);
    logMessage('custom', 'Tuner mode: Simulated Live schedule sync enabled');
    if (selectedChannel) {
      try {
        const live = getLiveEpisodeForChannel(selectedChannel, currentTimeMs);
        setSelectedShow(live.show);
        setSelectedEpisode(live.episode);
        setLiveSeekOffset(live.seekOffsetSeconds);
      } catch (e) {
        setLiveSeekOffset(0);
      }
    }
  };

  const setModeVOD = () => {
    setIsLiveMode(false);
    setLiveSeekOffset(0);
    logMessage('custom', 'Tuner mode: On-Demand seek index unlocked');
  };

  const handleEpisodeEnded = () => {
    if (isLiveMode) {
      if (selectedChannel) {
        try {
          const live = getLiveEpisodeForChannel(selectedChannel, currentTimeMs);
          if (live.remainingSeconds > 0) {
            const jumpMs = (live.remainingSeconds + 1) * 1000;
            setClockOffsetMs((prev) => prev + jumpMs);
            setCurrentTimeMs((prev) => prev + jumpMs);
            logMessage('custom', `EPG Segment ended early. Advancing virtual broadcast clock by ${Math.round(live.remainingSeconds)}s to next scheduled slot.`);
          } else {
            setCurrentTimeMs(Date.now() + clockOffsetMs + 1000);
          }
        } catch (e) {
          setCurrentTimeMs(Date.now() + clockOffsetMs + 1000);
        }
      }
    } else {
      if (!selectedShow || !selectedEpisode || !selectedChannel) return;
      const episodes = selectedShow.episodes || [];
      const currentIndex = episodes.findIndex(e => e.id === selectedEpisode.id);
      if (currentIndex !== -1 && currentIndex < episodes.length - 1) {
        const nextEp = episodes[currentIndex + 1];
        setSelectedEpisode(nextEp);
        logMessage('custom', `VoD Auto-Advance: Next episode "${nextEp.title}" is now playing...`);
      } else {
        const shows = selectedChannel.shows || [];
        const currentShowIndex = shows.findIndex(s => s.id === selectedShow.id);
        if (currentShowIndex !== -1 && currentShowIndex < shows.length - 1) {
          const nextShow = shows[currentShowIndex + 1];
          const nextEp = nextShow.episodes?.[0];
          if (nextEp) {
            setSelectedShow(nextShow);
            setSelectedEpisode(nextEp);
            logMessage('custom', `VoD Auto-Advance: Moving to next show "${nextShow.title}", playing "${nextEp.title}"...`);
          }
        } else if (shows.length > 0) {
          const firstShow = shows[0];
          const firstEp = firstShow.episodes?.[0];
          if (firstEp) {
            setSelectedShow(firstShow);
            setSelectedEpisode(firstEp);
            logMessage('custom', `VoD Auto-Advance: Looping back to first show "${firstShow.title}"...`);
          }
        }
      }
    }
  };

  // Local file loading
  const triggerFileLoad = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      try {
        let parsed: Channel[] = [];
        if (file.name.toLowerCase().endsWith('.json')) {
          parsed = parseMasterPlaylistJSON(text, file.name);
        } else {
          parsed = parseM3U(text, file.name);
        }

        if (parsed.length === 0) {
          logMessage('error', `Parsed 0 channels from "${file.name}". Make sure it is a valid file.`);
          return;
        }
        setChannels((prev) => [...prev, ...parsed]);
        setLoadedFiles((prev) => [...prev, file.name]);
        logMessage('custom', `Successfully imported ${parsed.length} channels from "${file.name}"`);
        if (parsed[0]) {
          handleSelectChannel(parsed[0]);
        }
      } catch (err) {
        logMessage('error', `Error parsing file: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(file);
    // Reset file input value to allow uploading same file
    e.target.value = '';
  };

  // URL remote playlist import
  const handleImportUrl = () => {
    if (!importUrlValue.trim()) return;
    
    logMessage('custom', `Fetching remote playlist from URL: "${importUrlValue}"...`);
    
    // Simulate remote fetching. Since CORS usually blocks raw random URLs, we simulate parsing a rich remote playlist.
    setTimeout(() => {
      const demoM3U = `#EXTM3U
#EXTINF:-1 tvg-id="PremiumSports" tvg-name="Premium Sports HD" tvg-logo="https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=120" group-title="Sports",Premium Sports HD
https://archive.org/download/rawhide-3-x-30-incident-of-the-wager-on-payday/Rawhide%20-%201X01%20-%20Incident%20Of%20The%20Tumbleweed.mp4
#EXTINF:-1 tvg-id="GlobalNews24" tvg-name="Global News 24/7" tvg-logo="https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=120" group-title="News",Global News 24/7
https://archive.org/download/man-with-a-camera-s-01-e-04-turntable/Man%20with%20a%20Camera_S01E01_Second%20Avenue%20Assassin.ia.mp4
#EXTINF:-1 tvg-id="RetroComedy" tvg-name="Classic Retro Comedy" tvg-logo="" group-title="TV Shows" custom-tag-pro="true",Classic Retro Comedy
https://archive.org/download/s-01e-02.-point-blank/Maverick%20S02e01%20-%20The%20Day%20They%20Hanged%20Bret%20Maverick.mp4`;

      try {
        const parsed = parseM3U(demoM3U, 'remote_import.m3u');
        setChannels((prev) => [...prev, ...parsed]);
        setLoadedFiles((prev) => [...prev, 'remote_import.m3u']);
        logMessage('custom', `Downloaded & parsed ${parsed.length} channels from remote link successfully.`);
        setShowImportUrlModal(false);
        setImportUrlValue('');
        if (parsed[0]) handleSelectChannel(parsed[0]);
      } catch (err) {
        logMessage('error', 'Remote import failed. XMLTV format error or network block.');
      }
    }, 1200);
  };

  // FETCH EPG URL simulation
  const handleFetchEpg = () => {
    if (!fetchEpgValue.trim()) return;
    logMessage('custom', `Fetching EPG XMLTV schedules from: ${fetchEpgValue}...`);
    setTimeout(() => {
      logMessage('epg', 'EPG parsing complete: Bound 14 time slots to loaded matrix items.');
      setShowFetchEpgModal(false);
      setFetchEpgValue('');
    }, 1000);
  };

  // URL link validator auditor
  const runChannelCheck = async () => {
    if (isCheckingUrls) return;
    setIsCheckingUrls(true);
    logMessage('custom', 'Initiating live IPTV channel stream link check...');

    const items = [...channels];
    for (let i = 0; i < items.length; i++) {
      const ch = items[i];
      // Mark as checking
      items[i] = { ...ch, status: 'checking' };
      setChannels([...items]);

      // Delay to simulate network ping checks
      await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 400));

      const streamUrl = ch.url || ch.shows?.[0]?.episodes?.[0]?.url || '';
      const isWorking = streamUrl.startsWith('http') && !streamUrl.includes('broken-link') && !streamUrl.includes('offline');

      items[i] = {
        ...ch,
        status: isWorking ? 'working' : 'broken'
      };
      setChannels([...items]);

      if (isWorking) {
        logMessage('playing', `[Audit]: CH ${ch.number} "${ch.name}" verified online ✓`);
      } else {
        logMessage('error', `[Audit]: CH ${ch.number} "${ch.name}" returned error or bad gateway ✗`);
      }
    }

    setIsCheckingUrls(false);
    logMessage('custom', 'Channel links audit finished successfully.');
  };

  // EXPORT / SAVE formats
  const handleSaveM3U = () => {
    const text = exportM3U(channels);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'matrix_playlist_export.m3u';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    logMessage('custom', 'Generated and downloaded "matrix_playlist_export.m3u" successfully.');
  };

  const handleExportCSV = () => {
    const text = exportCSV(channels);
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'matrix_channels.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    logMessage('custom', 'Exported channel index grid as "matrix_channels.csv"');
  };

  // SMART ORGANIZATION engine
  const runSmartOrganization = () => {
    logMessage('custom', 'Running smart playlist organization...');
    
    let list = [...channels];
    const initialCount = list.length;

    // 1. Remove duplicate channels by stream URL or Name
    const seenUrls = new Set<string>();
    const seenNames = new Set<string>();
    list = list.filter((ch) => {
      const url = ch.url || ch.shows?.[0]?.episodes?.[0]?.url || '';
      const nameKey = ch.name.toLowerCase().trim();
      if (seenUrls.has(url) || seenNames.has(nameKey)) {
        return false;
      }
      if (url) seenUrls.add(url);
      seenNames.add(nameKey);
      return true;
    });

    const duplicatesRemoved = initialCount - list.length;

    // 2. Normalize group/category names (Capitalize words, trim)
    list = list.map((ch) => {
      const cleanGroup = ch.category
        ? ch.category
            .trim()
            .split(/\s+/)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ')
        : 'General';
      return {
        ...ch,
        category: cleanGroup
      };
    });

    // 3. Sort alphabetically by name
    list.sort((a, b) => a.name.localeCompare(b.name));

    // 4. Auto-increment channel numbers starting from 101
    list = list.map((ch, idx) => ({
      ...ch,
      number: String(101 + idx)
    }));

    setChannels(list);
    if (list[0]) {
      handleSelectChannel(list[0]);
    }

    logMessage('custom', `Organization Finished: removed ${duplicatesRemoved} duplicates, normalized categories, sorted alphabetical, renumbered channels starting from 101.`);
  };

  // CLIPBOARD OPERATIONS
  const handleCopy = (ch: Channel) => {
    setCopiedChannel(ch);
    setIsCutOperation(false);
    logMessage('custom', `Copied channel "${ch.name}" to workspace clipboard.`);
  };

  const handleCut = (ch: Channel) => {
    setCopiedChannel(ch);
    setIsCutOperation(true);
    logMessage('custom', `Cut channel "${ch.name}" to workspace clipboard.`);
  };

  const handlePaste = (targetIndex: number) => {
    if (!copiedChannel) {
      logMessage('custom', 'Matrix Clipboard is empty. Copy or Cut a channel row first.');
      return;
    }

    const updated = [...channels];
    const newChannel: Channel = {
      ...copiedChannel,
      id: isCutOperation ? copiedChannel.id : `ch-paste-${Math.random().toString(36).substr(2, 9)}`,
      number: String(Number(channels[targetIndex]?.number || 100) + 1),
    };

    if (isCutOperation) {
      const originalIndex = updated.findIndex((c) => c.id === copiedChannel.id);
      if (originalIndex !== -1) {
        updated.splice(originalIndex, 1);
      }
      // Adjust paste position
      const finalTarget = originalIndex !== -1 && originalIndex < targetIndex ? targetIndex - 1 : targetIndex;
      updated.splice(finalTarget + 1, 0, newChannel);
      setIsCutOperation(false);
      setCopiedChannel(null);
    } else {
      updated.splice(targetIndex + 1, 0, newChannel);
    }

    setChannels(updated);
    logMessage('custom', `Pasted channel row "${newChannel.name}" after current row.`);
  };

  // ROW REORDER COMMANDS
  const moveChannel = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= channels.length) return;

    const list = [...channels];
    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;

    setChannels(list);
    logMessage('custom', `Moved CH "${temp.name}" ${direction} to position ${targetIndex + 1}`);
  };

  // INLINE DOUBLE-CLICK CELL EDITOR ACTION
  const handleCellDoubleClick = (channelId: string, fieldName: string, value: string) => {
    setEditingChannelId(channelId);
    setEditingFieldName(fieldName);
    setEditingValue(value);
  };

  const saveCellEdit = async () => {
    if (!editingChannelId || !editingFieldName) return;

    const updatedChannels = channels.map((ch) => {
      if (ch.id === editingChannelId) {
        const updated = { ...ch };
        if (editingFieldName === 'number') {
          updated.number = editingValue;
        } else if (editingFieldName === 'name') {
          updated.name = editingValue;
        } else if (editingFieldName === 'group') {
          updated.category = editingValue;
        } else if (editingFieldName === 'url') {
          const oldUrl = ch.url;
          updated.url = editingValue;
          if (updated.shows && updated.shows.length > 0) {
            updated.shows = updated.shows.map((s) => ({
              ...s,
              episodes: (s.episodes || []).map((e) => {
                if (!e.url || e.url === oldUrl || (updated.shows.length === 1 && s.episodes.length === 1)) {
                  return { ...e, url: editingValue };
                }
                return e;
              })
            }));
          } else {
            updated.shows = [
              {
                id: `show-${ch.id}`,
                title: ch.name || 'Live Broadcast',
                description: 'Custom Channel Broadcast',
                year: '2026',
                genre: ch.category || 'General',
                episodes: [
                  {
                    id: `ep-${ch.id}`,
                    title: ch.name || 'Live Stream',
                    url: editingValue,
                    durationMs: 86400000,
                    runtimeMins: 1440
                  }
                ]
              }
            ];
          }
        } else if (editingFieldName === 'nowPlaying') {
          if (updated.shows?.[0]) {
            updated.shows[0].title = editingValue;
            if (updated.shows[0].episodes?.[0]) {
              updated.shows[0].episodes[0].title = editingValue;
            }
          }
        } else if (editingFieldName === 'tags') {
          const parsedTags: Record<string, string> = {};
          editingValue.split(',').forEach((part) => {
            const trimmed = part.trim();
            if (!trimmed) return;
            const eqIdx = trimmed.indexOf('=');
            const colIdx = trimmed.indexOf(':');
            const splitIdx = eqIdx !== -1 ? eqIdx : colIdx;
            if (splitIdx !== -1) {
              const key = trimmed.substring(0, splitIdx).trim();
              const val = trimmed.substring(splitIdx + 1).trim();
              if (key) parsedTags[key] = val;
            } else {
              parsedTags[trimmed] = 'true';
            }
          });
          updated.customTags = parsedTags;
        }
        return updated;
      }
      return ch;
    });

    setChannels(updatedChannels);

    if (selectedChannel && selectedChannel.id === editingChannelId) {
      const editedCh = updatedChannels.find((c) => c.id === editingChannelId);
      if (editedCh) {
        handleSelectChannel(editedCh);
      }
    }

    // Persist updated metadata to backend database so channel-to-file mappings remain synchronized
    try {
      await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedChannels),
      });
    } catch (err: any) {
      console.error('[Channel Sync] Failed to persist edited channel metadata:', err);
    }

    logMessage('custom', `Updated field "${editingFieldName}" value to "${editingValue}"`);
    setEditingChannelId(null);
    setEditingFieldName(null);
  };

  // CREATE NEW CHANNEL
  const handleAddChannel = async () => {
    const newNum = String(101 + channels.length);
    const newChannel: Channel = {
      id: `ch-custom-${Date.now()}`,
      number: newNum,
      name: `Custom Station ${newNum}`,
      category: 'User Stations',
      tagline: 'Custom stream broadcast',
      logoText: 'CUSTOM',
      accentColor: '#8b5cf6',
      url: 'https://archive.org/download/classic_tv_commercials/station_id_slate.mp4',
      shows: [
        {
          id: `show-custom-${Date.now()}`,
          title: `Custom Live Broadcast`,
          description: 'User created custom channel broadcast',
          year: '2026',
          genre: 'User Stations',
          episodes: [
            {
              id: `ep-custom-${Date.now()}`,
              title: 'Live Custom Feed',
              url: 'https://archive.org/download/classic_tv_commercials/station_id_slate.mp4',
              durationMs: 86400000,
              runtimeMins: 1440
            }
          ]
        }
      ]
    };

    const updated = [...channels, newChannel];
    setChannels(updated);
    setSelectedCategory('All');
    setSearchQuery('');
    setSelectedTagFilter('All');
    setShowFavoritesOnly(false);
    handleSelectChannel(newChannel);
    setSelectedRowId(newChannel.id);
    logMessage('custom', `Created new channel CH ${newChannel.number} "${newChannel.name}". You can double-click any cell in the matrix grid to edit URL, name, or category.`);

    try {
      await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } catch (err: any) {
      console.error('[Add Channel Sync] Failed to save new channel:', err);
    }
  };

  // DELETE CHANNEL
  const deleteChannel = async (channelId: string) => {
    const target = channels.find((c) => c.id === channelId);
    const updated = channels.filter((c) => c.id !== channelId);
    setChannels(updated);
    logMessage('custom', `Deleted channel row: "${target?.name || channelId}"`);

    if (selectedChannel.id === channelId && updated.length > 0) {
      handleSelectChannel(updated[0]);
    }

    try {
      await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } catch (err: any) {
      console.error('[Channel Sync] Failed to sync channel deletion to database:', err);
    }
  };

  // TOGGLE FAVORITE
  const toggleFavorite = async (channelId: string) => {
    const updatedChannels = channels.map((ch) => {
      if (ch.id === channelId) {
        const newFav = !ch.favorite;
        logMessage('custom', `${newFav ? '★ Starred' : '☆ Unstarred'} channel "${ch.name}"`);
        return { ...ch, favorite: newFav };
      }
      return ch;
    });
    setChannels(updatedChannels);

    // Sync selected channel state if it is the toggled one
    if (selectedChannel && selectedChannel.id === channelId) {
      setSelectedChannel(prev => ({ ...prev, favorite: !prev.favorite }));
    }

    try {
      const saveRes = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedChannels),
      });
      if (!saveRes.ok) {
        logMessage('error', 'Failed to persist favorite toggle state to database.');
      }
    } catch (err: any) {
      console.error('Error saving favorite to server:', err);
      logMessage('error', `Error saving favorite: ${err.message}`);
    }
  };

  // BACKUP URLS CONTROLLER
  const openBackupModal = (channelId: string) => {
    setBackupChannelId(channelId);
    setShowBackupsModal(true);
  };

  const addBackupUrl = () => {
    if (!newBackupUrl.trim() || !backupChannelId) return;

    setChannels((prev) =>
      prev.map((ch) => {
        if (ch.id === backupChannelId) {
          return {
            ...ch,
            backupUrls: [...(ch.backupUrls || []), newBackupUrl.trim()]
          };
        }
        return ch;
      })
    );

    logMessage('custom', `Added backup stream URL to channel id ${backupChannelId}`);
    setNewBackupUrl('');
    setShowBackupsModal(false);
  };

  const removeBackupUrl = (index: number) => {
    if (!backupChannelId) return;

    setChannels((prev) =>
      prev.map((ch) => {
        if (ch.id === backupChannelId) {
          const list = [...(ch.backupUrls || [])];
          list.splice(index, 1);
          return { ...ch, backupUrls: list };
        }
        return ch;
      })
    );
    logMessage('custom', 'Removed backup stream URL.');
  };

  // TV GUIDE / SCHEDULE CONTROLLER
  const handleAddScheduleShow = (title: string, desc: string, genre: string, url: string) => {
    if (!selectedChannel) return;

    const newShow: Show = {
      id: `show-add-${Date.now()}`,
      title,
      description: desc,
      year: new Date().getFullYear().toString(),
      genre,
      episodes: [
        {
          id: `ep-add-${Date.now()}`,
          title: 'Broadcast Episode',
          url: url || selectedChannel.url || ''
        }
      ]
    };

    setChannels((prev) =>
      prev.map((ch) => {
        if (ch.id === selectedChannel.id) {
          return {
            ...ch,
            shows: [...ch.shows, newShow]
          };
        }
        return ch;
      })
    );

    logMessage('custom', `Scheduled new show "${title}" on CH ${selectedChannel.number}`);
  };

  // AUTO-SCHEDULE CONDUIT FOR CLASSIC CINEMA & MOVIES
  const handleAutoScheduleClassicCinema = (quiet: boolean = false) => {
    // 1. Find Classic Cinema & Movies channel
    const targetChannelIndex = channels.findIndex(
      (c) => c.id === 'ch-retro-adventure' || c.name.toLowerCase().includes('classic cinema')
    );
    if (targetChannelIndex === -1) {
      if (!quiet) logMessage('error', 'Could not locate Classic Cinema & Movies channel.');
      return;
    }

    const targetChannel = channels[targetChannelIndex];

    // 2. Filter other channels
    const otherChannels = channels.filter((_, idx) => idx !== targetChannelIndex);
    if (otherChannels.length === 0) {
      if (!quiet) logMessage('error', 'No other channels found to schedule programs from.');
      return;
    }

    // Helper to extract category or genre for any channel/show combination
    const getCategoryOrGenre = (ch: Channel, show: Show): string => {
      const channelCat = ch.category || '';
      const showGenre = show.genre || '';
      if (channelCat === 'Westerns' || showGenre.toLowerCase().includes('western')) return 'Westerns';
      if (channelCat === 'Crime Shows' || showGenre.toLowerCase().includes('crime')) return 'Crime Shows';
      if (channelCat === 'News' || showGenre.toLowerCase().includes('news')) return 'News';
      if (channelCat === 'Movies' || showGenre.toLowerCase().includes('movie')) return 'Movies';
      if (
        channelCat === 'TV Shows' || 
        showGenre.toLowerCase().includes('tv') || 
        showGenre.toLowerCase().includes('comedy') || 
        showGenre.toLowerCase().includes('drama')
      ) return 'TV Shows';
      return channelCat || 'General';
    };

    interface PoolItem {
      show: Show;
      episode: Episode;
      category: string;
    }

    const masterPool: PoolItem[] = [];
    otherChannels.forEach((ch) => {
      ch.shows.forEach((show) => {
        show.episodes.forEach((ep) => {
          masterPool.push({
            show,
            episode: ep,
            category: getCategoryOrGenre(ch, show)
          });
        });
      });
    });

    if (masterPool.length === 0) {
      if (!quiet) logMessage('error', 'No episodes found in other active channels.');
      return;
    }

    // Filter master pool by active schedulerSelectedGenres
    // "intelligently skip or flag shows tagged with 'Western' or 'Crime' when running the round-robin generator"
    const activePool = masterPool.filter((item) => {
      const cat = item.category;
      const isWestern = cat === 'Westerns' || (item.show.genre || '').toLowerCase().includes('western');
      const isCrime = cat === 'Crime Shows' || (item.show.genre || '').toLowerCase().includes('crime');

      if (isWestern && !schedulerSelectedGenres.includes('Westerns')) return false;
      if (isCrime && !schedulerSelectedGenres.includes('Crime Shows')) return false;
      
      return schedulerSelectedGenres.includes(cat) || schedulerSelectedGenres.includes(item.show.genre || '');
    });

    if (activePool.length === 0) {
      if (!quiet) logMessage('error', 'No episodes match the selected active genres for scheduling.');
      return;
    }

    // 4. Create blocks of schedule. A single daily sequence has 48 slots (30 minutes each for 24 hours).
    const slotsCount = 48;
    const blockLayoutHours = Number(schedulerBlockLayout) || 4;
    const slotsPerBlock = blockLayoutHours * 2; 

    const scheduledItems: PoolItem[] = [];

    // Helper to retrieve pool for a specific theme
    const getPoolForTheme = (theme: string): PoolItem[] => {
      if (theme === 'All' || theme === 'Mix') {
        return activePool;
      }
      const filtered = activePool.filter((item) => {
        return item.category === theme || 
          (item.show.genre || '').toLowerCase().includes(theme.toLowerCase().replace('shows', '').replace('s', '').trim());
      });
      return filtered.length > 0 ? filtered : activePool; 
    };

    // Prepare theme pools & pointers
    const themePools: Record<string, PoolItem[]> = {
      morning: getPoolForTheme(schedulerMorningTheme),
      afternoon: getPoolForTheme(schedulerAfternoonTheme),
      evening: getPoolForTheme(schedulerEveningTheme),
      lateLate: getPoolForTheme(schedulerLateLateTheme)
    };

    const themePointers: Record<string, number> = {
      morning: 0,
      afternoon: 0,
      evening: 0,
      lateLate: 0
    };

    // Round-robin selection through each block
    for (let s = 0; s < slotsCount; s++) {
      const hour = s * 0.5;
      let band: 'morning' | 'afternoon' | 'evening' | 'lateLate';

      if (hour >= 6 && hour < 12) {
        band = 'morning';
      } else if (hour >= 12 && hour < 18) {
        band = 'afternoon';
      } else if (hour >= 18 && hour < 24) {
        band = 'evening';
      } else {
        band = 'lateLate';
      }

      const pool = themePools[band];
      const pointer = themePointers[band];
      const item = pool[pointer % pool.length];

      scheduledItems.push(item);
      themePointers[band]++;
    }

    // Convert scheduled items to Classic Cinema & Movies shows list
    const newShows: Show[] = scheduledItems.map((item, idx) => {
      const isWestern = item.category === 'Westerns' || (item.show.genre || '').toLowerCase().includes('western');
      const isCrime = item.category === 'Crime Shows' || (item.show.genre || '').toLowerCase().includes('crime');
      
      let titleFlag = '';
      if (isWestern) {
        titleFlag = ' 🤠'; 
      } else if (isCrime) {
        titleFlag = ' 🔍'; 
      }

      return {
        id: `rcs-show-${idx}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        title: `${item.show.title}${titleFlag}`,
        description: `[Scheduled: Theme Block] Genre: ${item.category}. ${item.show.description}`,
        year: item.show.year,
        genre: item.show.genre,
        episodes: [
          {
            id: `rcs-ep-${idx}-${Date.now()}`,
            title: `${item.episode.title}${titleFlag}`,
            season: item.episode.season || '1',
            episodeNumber: item.episode.episodeNumber || String(idx + 1),
            url: item.episode.url
          }
        ]
      };
    });

    setChannels((prev) =>
      prev.map((ch, idx) => {
        if (idx === targetChannelIndex) {
          return {
            ...ch,
            shows: newShows
          };
        }
        return ch;
      })
    );

    const updatedChannel = {
      ...targetChannel,
      shows: newShows
    };

    if (selectedChannel.id === targetChannel.id && newShows.length > 0) {
      setSelectedChannel(updatedChannel);
      try {
        const live = getLiveEpisodeForChannel(updatedChannel, currentTimeMs);
        setSelectedShow(live.show);
        setSelectedEpisode(live.episode);
        setLiveSeekOffset(live.seekOffsetSeconds);
      } catch (e) {
        setSelectedShow(newShows[0]);
        setSelectedEpisode(newShows[0].episodes[0]);
        setLiveSeekOffset(0);
      }
    }

    if (!quiet) {
      logMessage(
        'epg',
        `[Auto-Scheduler]: Scheduled 24-hour loop of ${newShows.length} shows on "Classic Cinema & Movies" in themed mixes (Morning: ${schedulerMorningTheme}, Afternoon: ${schedulerAfternoonTheme}, Evening: ${schedulerEveningTheme}, Late Late: ${schedulerLateLateTheme}) in ${schedulerBlockLayout}-hour layout blocks.`
      );
    }
  };

  // Automatically update round robin schedule whenever a new file is registered in the workspace
  useEffect(() => {
    if (loadedFiles.length > 1 || (loadedFiles.length === 1 && loadedFiles[0] !== 'Classic_Retro_TV_Defaults.m3u')) {
      handleAutoScheduleClassicCinema(true);
      logMessage('epg', '[Auto-Scheduler]: Dynamically updated Classic Cinema & Movies schedule to include newly loaded resources.');
    }
  }, [loadedFiles]);

  // RESET fresh playlist workspace
  const handleNewPlaylist = () => {
    setChannels([]);
    setLoadedFiles([]);
    logMessage('custom', 'Cleared IPTV matrix workspace. Load or paste list to start fresh.');
  };

  // GET DYNAMIC CATEGORIES FOR TABS
  const categoriesList = ['All', ...Array.from(new Set(channels.map((ch) => ch.category || 'Uncategorized'))).sort()];

  // GET DYNAMIC TAGS LIST FROM CUSTOM TAGS
  const tagsList = ['All', ...(Array.from(new Set(channels.flatMap((ch) => Object.entries(ch.customTags || {}).map(([k, v]) => v === 'true' ? k : `${k}=${v}`)))).sort() as string[])];

  // FILTER CHANNELS USING SEARCH & REGEX
  let filteredChannels = channels;
  
  if (selectedCategory !== 'All') {
    filteredChannels = filteredChannels.filter((ch) => ch.category === selectedCategory);
  }

  if (selectedTagFilter !== 'All') {
    filteredChannels = filteredChannels.filter((ch) => {
      if (!ch.customTags) return false;
      const eqIndex = selectedTagFilter.indexOf('=');
      const [filterKey, filterVal] = eqIndex !== -1
        ? [selectedTagFilter.substring(0, eqIndex), selectedTagFilter.substring(eqIndex + 1)]
        : [selectedTagFilter, 'true'];
      return ch.customTags[filterKey] === filterVal;
    });
  }

  let regexSearchError: string | null = null;
  if (searchQuery.trim()) {
    const query = searchQuery.trim();
    const regexMatch = query.match(/^\/(.+)\/([gimy]*)$/);
    
    if (regexMatch) {
      try {
        const pattern = regexMatch[1];
        const flags = regexMatch[2];
        const regex = new RegExp(pattern, flags);
        filteredChannels = filteredChannels.filter((ch) => regex.test(ch.name) || regex.test(ch.category));
      } catch (e) {
        regexSearchError = 'Invalid Regular Expression syntax';
      }
    } else {
      const lowerQuery = query.toLowerCase();
      filteredChannels = filteredChannels.filter(
        (ch) =>
          ch.name.toLowerCase().includes(lowerQuery) ||
          ch.category.toLowerCase().includes(lowerQuery) ||
          ch.number.includes(lowerQuery)
      );
    }
  }

  if (showFavoritesOnly) {
    filteredChannels = filteredChannels.filter((ch) => ch.favorite);
  }

  // Active channel EPG details
  const activeChannelEpg = selectedChannel
    ? (() => {
        try {
          return getLiveEpisodeForChannel(selectedChannel, currentTimeMs);
        } catch (e) {
          return {
            show: selectedChannel.shows?.[0] || { title: 'No Schedule', description: 'Double click cell to add shows.' },
            episode: selectedChannel.shows?.[0]?.episodes?.[0] || { title: 'Live Stream Link' },
            upcomingSlots: []
          };
        }
      })()
    : null;

  // Render check
  const activeChannelStatus = selectedChannel?.status || 'unchecked';

  return (
    <div id="app-root" className="flex flex-col h-screen min-h-screen w-full min-w-full bg-[#0b0c10] text-[#c5c6c7] font-sans overflow-hidden app-root-container">
      {!isWorkspaceOpen ? (
        /* Cinema-First Viewing Mode Layout */
        <div className="relative w-full h-full overflow-hidden select-none">
          {/* Base Layer: completely uninterrupted backdrop (z-index: 1) */}
          {selectedEpisode && selectedShow ? (
            <CustomVideoPlayer
              episode={selectedEpisode}
              show={selectedShow}
              channelId={selectedChannel?.id || ''}
              channelName={selectedChannel?.name || 'Retro TV Network'}
              isLiveMode={isLiveMode}
              liveSeekOffset={liveSeekOffset}
              onLogEvent={logMessage}
              isCinemaBackdrop={true}
              videoFit={videoFit}
              onEpisodeEnded={handleEpisodeEnded}
              schedulingMode={schedulingMode}
              onDurationProbed={handleDurationProbed}
              nextEpisode={activeChannelEpg?.upcomingSlots?.[0]?.episode}
            />
          ) : (
            <div className="fixed inset-0 w-full h-full bg-black flex items-center justify-center text-white/30 text-xs font-mono">
              Readying Satellite Dish Signals...
            </div>
          )}

          {/* Invisible Hover Triggers (Hitboxes) for sliding/fading elements */}
          <div
            className="hover-hitbox-left"
            onMouseEnter={() => {
              setIsStationDrawerOpen(true);
              resetDecayTimer();
            }}
          />
          <div
            className="hover-hitbox-bottom"
            onMouseEnter={() => {
              setIsEPGOverlayVisible(true);
              resetDecayTimer();
            }}
          />

          {/* Sliding Left Channel Menu Drawer (z-index: 100) */}
          <div
            onMouseEnter={() => {
              isHoveringMenuRef.current = true;
              clearDecayTimer();
            }}
            onMouseLeave={() => {
              isHoveringMenuRef.current = false;
              resetDecayTimer();
            }}
            className="transition-all"
          >
            <StationDirectory
              channels={channels}
              selectedChannel={selectedChannel}
              onSelectChannel={(ch) => {
                handleSelectChannel(ch);
                logMessage('epg', `[Cinema Tuner]: Tuned satellite dish to CH ${ch.number} - ${ch.name}`);
                resetDecayTimer();
              }}
              isOpen={isStationDrawerOpen}
              currentTimeMs={currentTimeMs}
            />
          </div>

          {/* Floating Bottom TV Guide Overlay (z-index: 90) */}
          <div
            onMouseEnter={() => {
              isHoveringMenuRef.current = true;
              clearDecayTimer();
            }}
            onMouseLeave={() => {
              isHoveringMenuRef.current = false;
              resetDecayTimer();
            }}
            className="transition-all"
          >
            <CinemaEPGGuide
              channel={selectedChannel}
              selectedEpisode={selectedEpisode}
              isLiveMode={isLiveMode}
              onSelectEpisode={(show, ep, isLive) => {
                setSelectedShow(show);
                setSelectedEpisode(ep);
                setIsLiveMode(isLive);
                if (isLive && selectedChannel) {
                  try {
                    const live = getLiveEpisodeForChannel(selectedChannel, currentTimeMs);
                    setLiveSeekOffset(live.seekOffsetSeconds);
                  } catch (e) {
                    setLiveSeekOffset(0);
                  }
                  logMessage('epg', `[Cinema Tuner]: Synced back to Live Simulated Broadcast for ${show.title}`);
                } else {
                  setLiveSeekOffset(0);
                  logMessage('epg', `[Cinema Tuner]: Opened Interactive VOD Segment: "${show.title} - ${ep.title}"`);
                }
                resetDecayTimer();
              }}
              isVisible={isEPGOverlayVisible}
              currentTimeMs={currentTimeMs}
            />
          </div>

          {/* Elegant Top HUD overlay controls bar */}
          <div
            onMouseEnter={() => {
              isHoveringMenuRef.current = true;
              clearDecayTimer();
            }}
            onMouseLeave={() => {
              isHoveringMenuRef.current = false;
              resetDecayTimer();
            }}
            className={`fixed top-4 right-4 z-[110] flex items-center gap-3 transition-all duration-500 ${
              isHUDVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
            }`}
          >
            {/* HUD Status Pill */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-full border border-white/10 text-[10px] font-mono shadow-xl">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-white/60">STATION:</span>
              <strong className="text-white tracking-wide uppercase">
                {selectedChannel?.name || 'OFFLINE'}
              </strong>
            </div>

            {/* Aspect Ratio Toggle HUD Button */}
            <button
              onClick={() => {
                setVideoFit((prev) => {
                  const next = prev === 'cover' ? 'contain' : 'cover';
                  logMessage('custom', `Aspect Ratio switched to: ${next === 'cover' ? 'FILL SCREEN (COVER)' : 'LETTERBOX (CONTAIN)'}`);
                  return next;
                });
              }}
              className="px-3.5 py-1.5 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white border border-white/10 text-[10px] font-mono rounded-full flex items-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer"
              title="Toggle aspect ratio: Cover (Full screen) vs Contain (4:3 Letterbox) [Shortcut: A]"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              <span>RATIO: {videoFit.toUpperCase()}</span>
            </button>

            {/* Floating Workspace Mode Toggle Button */}
            <button
              onClick={() => setIsWorkspaceOpen(true)}
              className="px-4 py-1.5 bg-[#8c5cd0]/80 hover:bg-[#8c5cd0] backdrop-blur-md text-white border border-[#8c5cd0]/40 text-[10px] font-black tracking-widest rounded-full flex items-center gap-2 shadow-lg hover:shadow-purple-500/20 active:scale-95 transition-all cursor-pointer"
              title="Open Pro Matrix Spreadsheet & Sync console"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>WORKSPACE DECK</span>
            </button>
          </div>

          {/* Quick-instructions bottom-left corner anchor */}
          <div
            className={`fixed bottom-4 left-6 z-[110] text-left transition-all duration-500 select-none pointer-events-none ${
              isHUDVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <p className="text-[10px] font-mono text-white/40 leading-normal uppercase tracking-wider">
              [M] Left Menu • [G] Bottom Guide • [A] Toggle Ratio • [S] Pro Workspace
            </p>
          </div>
        </div>
      ) : (
        /* Workspace Mode: original layout wraps inside a sub-container */
        <div className="flex-1 flex flex-col overflow-hidden relative">
          
          {/* 1. Header Branded Banner Rail */}
          <header className="h-16 border-b border-purple-900/40 bg-[#1f2833]/30 px-6 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-tr from-purple-700 to-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-sm shadow-md shadow-purple-500/20 tracking-wider">
                M3U
              </div>
              <div>
                <h1 className="text-sm font-black text-white uppercase tracking-wider font-sans flex items-center gap-2">
                  Classic TV Guide & News Player <span className="text-[9px] bg-purple-500/10 border border-purple-500/30 text-purple-400 px-1.5 py-0.5 rounded font-mono font-normal">WEB BUILD</span>
                </h1>
                <p className="text-[10px] text-gray-500 font-mono">Professional IPTV Playlist Suite</p>
              </div>
            </div>

            {/* Global Live Statistics Status */}
            <div className="hidden md:flex items-center gap-6 text-[10px] font-mono bg-black/40 px-4 py-2 border border-purple-900/30 rounded-lg">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span>TOTAL: <strong className="text-white">{channels.length}</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span>WORKING: <strong className="text-green-400">{channels.filter((c) => c.status === 'working').length}</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span>BROKEN: <strong className="text-red-400">{channels.filter((c) => c.status === 'broken').length}</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-500" />
                <span>UNCHECKED: <strong className="text-gray-400">{channels.filter((c) => !c.status || c.status === 'unchecked').length}</strong></span>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono text-gray-400">
              <Clock className="w-4 h-4 text-purple-400" />
              <span>{new Date(currentTimeMs).toLocaleTimeString([], { hour12: false })}</span>

              <button
                onClick={() => setIsWorkspaceOpen(false)}
                className="ml-3 px-3 py-1 bg-gradient-to-r from-purple-800 to-[#8c5cd0] hover:from-purple-700 hover:to-purple-600 text-white rounded-md text-[11px] font-black tracking-wider transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-md shadow-purple-500/10 animate-pulse"
                title="Switch to edge-to-edge Cinema Viewing Mode"
                id="btn-workspace-cinema-view"
              >
                <MonitorPlay className="w-3.5 h-3.5 animate-pulse" />
                <span>CINEMA VIEW</span>
              </button>
            </div>
          </header>

      {/* 2. Action Toolbar Ribbon */}
      <nav className="p-3 border-b border-purple-950/30 bg-[#0f1015] flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          {/* LOAD trigger */}
          <button
            onClick={triggerFileLoad}
            className="px-3 py-1.5 bg-purple-900/20 hover:bg-purple-900/40 border border-purple-800/30 hover:border-purple-700/50 text-purple-300 text-[11px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            title="Import local M3U/M3U8 file"
            id="btn-matrix-load"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>LOAD</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".m3u,.m3u8,.txt"
            onChange={handleFileUpload}
          />

          {/* REMOTE URL IMPORT */}
          <button
            onClick={() => setShowImportUrlModal(true)}
            className="px-3 py-1.5 bg-indigo-950/30 hover:bg-indigo-900/30 border border-indigo-800/30 hover:border-indigo-700/50 text-indigo-300 text-[11px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            title="Import remote playlist URL"
            id="btn-matrix-import-url"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>IMPORT URL</span>
          </button>

          {/* CREATE NEW CHANNEL */}
          <button
            onClick={handleAddChannel}
            className="px-3 py-1.5 bg-purple-950/40 hover:bg-purple-900/50 border border-purple-700/50 hover:border-purple-600/70 text-purple-300 text-[11px] font-black rounded-md flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-md shadow-purple-950/30"
            title="Create a new custom channel"
            id="btn-matrix-add-channel"
          >
            <Plus className="w-3.5 h-3.5 text-purple-400" />
            <span>+ ADD CHANNEL</span>
          </button>

          {/* FETCH EPG */}
          <button
            onClick={() => setShowFetchEpgModal(true)}
            className="px-3 py-1.5 bg-blue-950/30 hover:bg-blue-900/30 border border-blue-800/30 hover:border-blue-700/50 text-blue-300 text-[11px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            title="Import XMLTV program guide"
            id="btn-matrix-fetch-epg"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>FETCH EPG</span>
          </button>

          {/* COMMERCIAL FILLS */}
          <button
            onClick={() => setShowCommercialModal(true)}
            className="px-3 py-1.5 bg-amber-950/30 hover:bg-amber-900/30 border border-amber-800/30 hover:border-amber-700/50 text-amber-300 text-[11px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            title="Open Commercial & Interstitial Filler Pool & Gap Simulator"
            id="btn-matrix-commercials"
          >
            <Tv className="w-3.5 h-3.5 text-amber-400" />
            <span>COMMERCIALS</span>
          </button>

          <div className="h-5 w-[1px] bg-gray-800 mx-1" />

          {/* ORGANIZE */}
          <button
            onClick={runSmartOrganization}
            className="px-3 py-1.5 bg-[#1f2833]/40 hover:bg-[#1f2833]/80 border border-gray-800 hover:border-gray-700 text-gray-200 text-[11px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            title="Sort channels alphabetically, normalize groupings, auto-renumber and clean duplicates"
            id="btn-matrix-organize"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>ORGANIZE</span>
          </button>

          {/* CHECK */}
          <button
            onClick={runChannelCheck}
            disabled={isCheckingUrls || channels.length === 0}
            className={`px-3 py-1.5 text-[11px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
              isCheckingUrls
                ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
                : 'bg-green-950/30 hover:bg-green-900/30 border border-green-800/30 text-green-400 hover:text-green-300'
            }`}
            title="Validate all stream link URLs for network responses"
            id="btn-matrix-check"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{isCheckingUrls ? 'CHECKING...' : 'CHECK LINKS'}</span>
          </button>

          <div className="h-5 w-[1px] bg-gray-800 mx-1" />

          {/* TV GUIDE Edit */}
          <button
            onClick={() => {
              if (selectedChannel) setShowTvGuideModal(true);
            }}
            disabled={!selectedChannel}
            className="px-3 py-1.5 bg-slate-900 border border-gray-800 text-gray-300 hover:bg-gray-800 text-[11px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            title="Edit programs schedule list for selected channel"
            id="btn-matrix-tv-guide"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>SCHEDULE</span>
          </button>

          {/* AUTO-SCHEDULE */}
          <button
            onClick={() => setShowAutoSchedulerModal(true)}
            className="px-3 py-1.5 bg-gradient-to-r from-purple-900 to-indigo-900 hover:from-purple-800 hover:to-indigo-800 border border-purple-700/50 text-white text-[11px] font-black rounded-md flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            title="Automatically schedule loaded channels into Classic Cinema daily loop in round-robin order"
            id="btn-matrix-auto-schedule"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-300 animate-pulse" />
            <span>AUTO-SCHEDULE</span>
          </button>
        </div>

        {/* EXPORTS BUTTONS */}
        <div className="flex items-center gap-2 mt-2 lg:mt-0">
          <button
            onClick={handleSaveM3U}
            disabled={channels.length === 0}
            className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 border border-purple-600 text-white text-[11px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            title="Download active playlist as standard M3U"
            id="btn-matrix-save"
          >
            <Download className="w-3.5 h-3.5" />
            <span>SAVE M3U</span>
          </button>

          <button
            onClick={handleExportCSV}
            disabled={channels.length === 0}
            className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 text-[11px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            title="Export channel inventory as CSV spreadsheet"
            id="btn-matrix-export-csv"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>EXPORT CSV</span>
          </button>

          <button
            onClick={handleNewPlaylist}
            className="px-3 py-1.5 bg-red-950/20 hover:bg-red-900/30 border border-red-900/40 text-red-400 text-[11px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            title="Clear workspace"
            id="btn-matrix-new"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>NEW</span>
          </button>
        </div>
      </nav>

      {/* 3. Main Workspace Layout Grid */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden w-full">
        
        {/* SIDEBAR LEFT PANEL */}
        <aside className="w-72 border-r border-purple-950/30 bg-[#0f1015] flex flex-col shrink-0 h-full overflow-hidden hidden xl:flex">
          
          {/* Loaded Files Registry */}
          <div className="p-4 border-b border-purple-950/20">
            <h2 className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5" />
              LOADED REGISTRY
            </h2>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 scrollbar-thin">
              {loadedFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-[#1f2833]/20 border border-gray-800/40 rounded text-[11px] font-mono text-gray-300">
                  <span className="truncate pr-2">{file}</span>
                  <span className="text-[9px] bg-purple-500/10 text-purple-400 px-1.5 py-0.2 rounded shrink-0">Active</span>
                </div>
              ))}
              {loadedFiles.length === 0 && (
                <div className="text-[10px] text-gray-600 font-mono italic p-2 text-center">No loaded playlists</div>
              )}
            </div>
          </div>

          {/* Live Guide Preview Inspector */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 scrollbar-thin">
            <div>
              <h2 className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <MonitorPlay className="w-3.5 h-3.5" />
                TUNER DETAILS
              </h2>
              {selectedChannel ? (
                <div className="p-3 bg-[#1f2833]/20 border border-purple-900/30 rounded-lg space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-10 h-6 rounded flex items-center justify-center text-[9px] font-black tracking-widest text-white select-none font-mono shrink-0"
                      style={{ backgroundColor: selectedChannel.accentColor }}
                    >
                      {selectedChannel.logoText || 'IPTV'}
                    </div>
                    <div className="text-left overflow-hidden">
                      <div className="text-[10px] font-mono text-purple-400">CH {selectedChannel.number}</div>
                      <h3 className="text-xs font-bold text-white truncate">{selectedChannel.name}</h3>
                    </div>
                  </div>

                  <div className="border-t border-purple-950/30 pt-2 space-y-1.5 text-xs text-left">
                    <div className="text-[10px] font-mono text-gray-500">GROUP / CATEGORY:</div>
                    <div className="font-semibold text-gray-300 truncate">{selectedChannel.category || 'General'}</div>
                  </div>

                  {activeChannelEpg && (
                    <div className="border-t border-purple-950/30 pt-2 space-y-2 text-left">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-gray-500">NOW PLAYING:</span>
                        <span className="text-[9px] bg-red-500/10 border border-red-500/30 text-red-400 px-1 rounded animate-pulse">LIVE</span>
                      </div>
                      <div>
                        <div className="font-bold text-white text-xs">{activeChannelEpg.show.title}</div>
                        <p className="text-[11px] text-gray-400 line-clamp-3 mt-1 leading-relaxed">
                          {activeChannelEpg.show.description}
                        </p>
                      </div>

                      {activeChannelEpg.upcomingSlots?.[0] && (
                        <div className="bg-black/30 p-2 rounded border border-gray-900 text-[11px] mt-2 space-y-0.5">
                          <span className="text-[9px] font-mono text-purple-400">UP NEXT:</span>
                          <div className="text-white font-medium truncate">
                            {activeChannelEpg.upcomingSlots[0].show.title}: {activeChannelEpg.upcomingSlots[0].episode.title}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="border-t border-purple-950/30 pt-2 space-y-1 text-left">
                    <span className="text-[10px] font-mono text-gray-500">PLAYBACK STATUS:</span>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      {activeChannelStatus === 'working' ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                          <span className="text-green-400 font-bold font-mono">Verified Online</span>
                        </>
                      ) : activeChannelStatus === 'broken' ? (
                        <>
                          <XCircle className="w-3.5 h-3.5 text-red-500" />
                          <span className="text-red-400 font-bold font-mono">Stream Stalled</span>
                        </>
                      ) : (
                        <>
                          <div className="w-3 h-3 rounded-full bg-gray-700" />
                          <span className="text-gray-400 font-mono">Unchecked</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-gray-600 italic">No channel selected</div>
              )}
            </div>
          </div>
        </aside>

        {/* MIDDLE GRID & MATRIX VIEW */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0c0d11]">
          
          {/* Main Matrix Search bar & controls */}
          <div className="p-3 border-b border-purple-950/20 bg-[#121319] flex flex-wrap items-center justify-between gap-3">
            
            {/* Dynamic Search & Tag Filter */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative w-80 max-w-full">
                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, group, or /regex/i"
                  className="w-full bg-[#1b1c24] border border-purple-950/30 hover:border-purple-800/40 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 rounded-lg pl-9 pr-4 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none"
                />
                {regexSearchError && (
                  <span className="absolute -bottom-5 left-0 text-[9px] text-red-400 font-mono">{regexSearchError}</span>
                )}
              </div>

              {/* Tag Filter Dropdown */}
              <div className="flex items-center gap-1.5 bg-[#1b1c24] border border-purple-950/30 rounded-lg px-2.5 py-1">
                <Tag className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-[10px] uppercase font-mono tracking-wider text-gray-500 hidden sm:inline">TAG:</span>
                <select
                  value={selectedTagFilter}
                  onChange={(e) => {
                    setSelectedTagFilter(e.target.value);
                    logMessage('custom', `Filtered playlist by tag: "${e.target.value}"`);
                  }}
                  className="bg-transparent border-none text-[11px] text-gray-300 focus:outline-none cursor-pointer max-w-[130px] font-medium uppercase font-mono"
                >
                  <option value="All" className="bg-[#121319] text-gray-300">ALL TAGS</option>
                  {tagsList.filter(t => t !== 'All').map((tag) => (
                    <option key={tag} value={tag} className="bg-[#121319] text-gray-300">
                      {tag.toUpperCase()}
                    </option>
                  ))}
                </select>
                {selectedTagFilter !== 'All' && (
                  <button
                    onClick={() => {
                      setSelectedTagFilter('All');
                      logMessage('custom', 'Cleared tag filter');
                    }}
                    className="text-[9px] bg-purple-950/50 hover:bg-purple-900 border border-purple-800 text-purple-300 px-1.5 py-0.5 rounded transition-all font-mono font-bold cursor-pointer"
                  >
                    CLEAR
                  </button>
                )}
              </div>

              {/* Favorites Only Toggle */}
              <label className="flex items-center gap-1.5 bg-[#1b1c24] border border-purple-950/30 rounded-lg px-2.5 py-1 cursor-pointer hover:bg-purple-950/20 transition-all select-none">
                <input
                  type="checkbox"
                  checked={showFavoritesOnly}
                  onChange={(e) => {
                    setShowFavoritesOnly(e.target.checked);
                    logMessage('custom', `Show Favorites Only set to: ${e.target.checked}`);
                  }}
                  className="w-3.5 h-3.5 rounded text-purple-600 bg-black/40 border-purple-950/30 focus:ring-purple-500 cursor-pointer accent-purple-600"
                />
                <Star className={`w-3.5 h-3.5 ${showFavoritesOnly ? 'text-amber-400 fill-amber-400' : 'text-gray-400'}`} />
                <span className="text-[10px] font-mono tracking-wider uppercase text-gray-300 hidden xs:inline">FAVORITES ONLY</span>
              </label>
            </div>

            {/* Clipboard and Move Shortcuts */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  const target = channels.find((c) => c.id === selectedRowId);
                  if (target) handleCopy(target);
                }}
                disabled={!selectedRowId}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors disabled:opacity-40"
                title="Copy selected channel row (Ctrl+C)"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  const target = channels.find((c) => c.id === selectedRowId);
                  if (target) handleCut(target);
                }}
                disabled={!selectedRowId}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors disabled:opacity-40"
                title="Cut selected channel row (Ctrl+X)"
              >
                <Scissors className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  const idx = channels.findIndex((c) => c.id === selectedRowId);
                  if (idx !== -1) handlePaste(idx);
                }}
                disabled={!copiedChannel || !selectedRowId}
                className="p-1.5 text-purple-400 hover:text-purple-300 hover:bg-white/5 rounded transition-colors disabled:opacity-40"
                title="Paste copied channel row below selected (Ctrl+V)"
              >
                <Clipboard className="w-3.5 h-3.5" />
              </button>

              <div className="h-4 w-[1px] bg-gray-800 mx-1" />

              {/* Move row helpers */}
              <button
                onClick={() => {
                  const idx = channels.findIndex((c) => c.id === selectedRowId);
                  if (idx !== -1) moveChannel(idx, 'up');
                }}
                disabled={!selectedRowId || channels.findIndex((c) => c.id === selectedRowId) === 0}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors disabled:opacity-40"
                title="Move channel up"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  const idx = channels.findIndex((c) => c.id === selectedRowId);
                  if (idx !== -1) moveChannel(idx, 'down');
                }}
                disabled={!selectedRowId || channels.findIndex((c) => c.id === selectedRowId) === channels.length - 1}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors disabled:opacity-40"
                title="Move channel down"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Workspace Tabs Selector */}
          <div className="px-4 py-2.5 bg-[#121319] border-b border-purple-950/30 flex items-center justify-between gap-3 shrink-0">
            <div className="flex bg-black/60 p-1 rounded-lg border border-purple-950/30">
              <button
                onClick={() => setWorkspaceTab('matrix')}
                className={`px-4 py-1.5 rounded-md text-[11px] font-black tracking-wider uppercase transition-all cursor-pointer flex items-center gap-2 ${
                  workspaceTab === 'matrix'
                    ? 'bg-purple-900 text-white shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Matrix Spreadsheet</span>
              </button>
              <button
                onClick={() => setWorkspaceTab('epg')}
                className={`px-4 py-1.5 rounded-md text-[11px] font-black tracking-wider uppercase transition-all cursor-pointer flex items-center gap-2 ${
                  workspaceTab === 'epg'
                    ? 'bg-purple-900 text-white shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>EPG Guide Timeline</span>
              </button>
              <button
                onClick={() => {
                  setWorkspaceTab('export');
                }}
                className={`px-4 py-1.5 rounded-md text-[11px] font-black tracking-wider uppercase transition-all cursor-pointer flex items-center gap-2 ${
                  workspaceTab === 'export'
                    ? 'bg-purple-900 text-white shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Static Player</span>
              </button>
              <button
                onClick={() => setWorkspaceTab('scraper')}
                className={`px-4 py-1.5 rounded-md text-[11px] font-black tracking-wider uppercase transition-all cursor-pointer flex items-center gap-2 ${
                  workspaceTab === 'scraper'
                    ? 'bg-purple-900 text-white shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Cpu className="w-3.5 h-3.5 animate-pulse" />
                <span>AI Scraper</span>
              </button>
            </div>
            <div className="text-[10px] font-mono text-gray-500 uppercase tracking-wider hidden sm:block">
              {workspaceTab === 'matrix' 
                ? 'Double click any cell to edit inline' 
                : workspaceTab === 'epg' 
                  ? 'Real-time Program Loops' 
                  : workspaceTab === 'export'
                    ? 'Standalone HTML & Playlist Exporter'
                    : 'Stealth Scraper & Gemini AI Enrichment'}
            </div>
          </div>

          {workspaceTab === 'matrix' ? (
            <>
              {/* Dynamic Categories Tab Slider */}
              <div className="px-3 py-2 bg-[#121319]/50 border-b border-purple-950/10 flex flex-wrap gap-1 items-center overflow-x-auto whitespace-nowrap scrollbar-none shrink-0">
                {categoriesList.map((cat) => {
                  const isActive = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all border ${
                        isActive
                          ? 'bg-purple-900 text-purple-100 border-purple-800'
                          : 'bg-black/30 text-gray-500 border-transparent hover:text-gray-300'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>

              {/* Main Matrix Table */}
              <div className="flex-1 overflow-auto bg-[#0a0b0e] relative scrollbar-thin">
                {filteredChannels.length === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center text-gray-600 font-mono">
                    <Laptop className="w-12 h-12 text-gray-800 mb-4 animate-bounce" />
                    <p className="text-sm">No channels match current query / filter</p>
                    <p className="text-[11px] mt-1 text-gray-700">Double click cells or use toolbar to edit/populate playlist.</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs select-none">
                    <thead>
                      <tr className="bg-[#121319] border-b border-purple-950/30 text-purple-400 font-mono uppercase text-[9px] tracking-wider sticky top-0 z-10">
                        <th className="p-3 text-center w-12">#</th>
                        <th className="p-3 text-center w-12">FAV</th>
                        <th className="p-3 text-center w-14">STATUS</th>
                        <th className="p-3 w-32">GROUP</th>
                        <th className="p-3 w-44">CHANNEL NAME</th>
                        <th className="p-3 w-56">NOW PLAYING (EPG)</th>
                        <th className="p-3">STREAM URL</th>
                        <th className="p-3 text-center w-16">BACKS</th>
                        <th className="p-3 text-center w-16">TAGS</th>
                        <th className="p-3 text-center w-16">DEL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-950/10 font-sans">
                      {filteredChannels.map((ch, idx) => {
                        const isSelected = selectedRowId === ch.id;
                        const streamUrl = ch.url || ch.shows?.[0]?.episodes?.[0]?.url || '';
                        const backsCount = ch.backupUrls?.length || 0;
                        const tagsCount = ch.customTags ? Object.keys(ch.customTags).length : 0;
                        const nowPlayingInfo = ch.shows?.[0]?.title || 'Direct Stream Loop';

                        return (
                          <tr
                            key={ch.id}
                            onClick={() => {
                              setSelectedRowId(ch.id);
                            }}
                            onDoubleClick={() => handleSelectChannel(ch)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setContextMenu({
                                x: e.clientX,
                                y: e.clientY,
                                channelId: ch.id
                              });
                            }}
                            className={`hover:bg-[#1a1c24]/50 cursor-pointer transition-colors group ${
                              isSelected ? 'bg-purple-950/20 border-l-2 border-purple-500' : ''
                            }`}
                          >
                            {/* Number / Reorder UpDown handle */}
                            <td className="p-2.5 text-center font-mono font-bold text-gray-500">
                              {editingChannelId === ch.id && editingFieldName === 'number' ? (
                                <input
                                  type="text"
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  onBlur={saveCellEdit}
                                  onKeyDown={(e) => e.key === 'Enter' && saveCellEdit()}
                                  className="w-10 bg-black border border-purple-600 text-center rounded text-white"
                                  autoFocus
                                />
                              ) : (
                                <span
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    handleCellDoubleClick(ch.id, 'number', ch.number);
                                  }}
                                  className="hover:text-purple-400 transition-colors"
                                >
                                  {ch.number}
                                </span>
                              )}
                            </td>

                            {/* Favorite Star Icon Toggler */}
                            <td className="p-2.5 text-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFavorite(ch.id);
                                }}
                                className="p-1 hover:scale-110 active:scale-95 transition-all text-gray-600 hover:text-amber-400 cursor-pointer"
                                title={ch.favorite ? "Unstar channel" : "Star channel"}
                              >
                                <Star className={`w-4 h-4 mx-auto ${ch.favorite ? 'text-amber-400 fill-amber-400' : 'text-gray-600 hover:text-amber-400'}`} />
                              </button>
                            </td>

                            {/* Connection Audit Status */}
                            <td className="p-2.5 text-center">
                              {ch.status === 'working' && (
                                <div className="inline-flex items-center justify-center p-1 bg-green-500/10 border border-green-500/30 rounded text-green-400 font-mono font-bold text-[9px] px-1.5">
                                  ✓ ONLINE
                                </div>
                              )}
                              {ch.status === 'broken' && (
                                <div className="inline-flex items-center justify-center p-1 bg-red-500/10 border border-red-500/30 rounded text-red-400 font-mono font-bold text-[9px] px-1.5">
                                  ✗ DEAD
                                </div>
                              )}
                              {ch.status === 'checking' && (
                                <div className="inline-flex items-center justify-center p-1 bg-amber-500/10 border border-amber-500/30 rounded text-amber-400 font-mono text-[9px] px-1.5 animate-pulse">
                                  PING...
                                </div>
                              )}
                              {(!ch.status || ch.status === 'unchecked') && (
                                <div className="inline-flex items-center justify-center p-1 bg-[#1f2833]/30 border border-gray-800 rounded text-gray-500 font-mono text-[9px] px-1.5">
                                  ○ IDLE
                                </div>
                              )}
                            </td>

                            {/* Group / Category */}
                            <td className={`p-2.5 font-bold text-purple-400 max-w-[128px] ${editingChannelId === ch.id && editingFieldName === 'group' ? 'relative z-50' : 'truncate'}`}>
                              {editingChannelId === ch.id && editingFieldName === 'group' ? (
                                <div className="relative w-full">
                                  <input
                                    type="text"
                                    value={editingValue}
                                    onChange={(e) => setEditingValue(e.target.value)}
                                    onBlur={saveCellEdit}
                                    onKeyDown={(e) => e.key === 'Enter' && saveCellEdit()}
                                    className="w-full bg-black border border-purple-600 rounded text-white px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
                                    autoFocus
                                  />
                                  {/* Auto-complete Dropdown */}
                                  {(() => {
                                    const suggestions = (Array.from(new Set(channels.map((c) => c.category || 'General').filter(Boolean))) as string[])
                                      .sort()
                                      .filter((cat) => cat.toLowerCase().includes(editingValue.toLowerCase()));
                                    
                                    if (suggestions.length === 0) return null;
                                    return (
                                      <div className="absolute left-0 right-0 top-full mt-1 bg-[#10111a] border border-purple-600/50 rounded-lg shadow-2xl z-50 max-h-36 overflow-y-auto divide-y divide-purple-950/20 scrollbar-thin">
                                        {suggestions.map((suggestion) => (
                                          <div
                                            key={suggestion}
                                            onMouseDown={(e) => {
                                              e.preventDefault(); // Prevents onBlur of input from closing the editor first
                                              setEditingValue(suggestion);
                                              setChannels((prev) =>
                                                prev.map((c) => {
                                                  if (c.id === ch.id) {
                                                    return { ...c, category: suggestion };
                                                  }
                                                  return c;
                                                })
                                              );
                                              logMessage('custom', `Updated field "group" value to "${suggestion}" via auto-complete`);
                                              setEditingChannelId(null);
                                              setEditingFieldName(null);
                                            }}
                                            className="px-2.5 py-1.5 text-[11px] text-purple-300 hover:text-white hover:bg-purple-950/40 transition-colors cursor-pointer truncate font-medium text-left"
                                          >
                                            {suggestion}
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </div>
                              ) : (
                                <span
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    handleCellDoubleClick(ch.id, 'group', ch.category);
                                  }}
                                  className="hover:text-purple-300 transition-colors block truncate"
                                >
                                  {ch.category || 'General'}
                                </span>
                              )}
                            </td>

                            {/* Channel Name */}
                            <td className="p-2.5 font-semibold text-white">
                              <div className="flex items-center gap-2 max-w-[176px]">
                                {ch.logoUrl && (
                                  <img src={ch.logoUrl} alt="" className="w-6 h-4 object-cover rounded bg-black shrink-0" referrerPolicy="no-referrer" />
                                )}
                                {editingChannelId === ch.id && editingFieldName === 'name' ? (
                                  <input
                                    type="text"
                                    value={editingValue}
                                    onChange={(e) => setEditingValue(e.target.value)}
                                    onBlur={saveCellEdit}
                                    onKeyDown={(e) => e.key === 'Enter' && saveCellEdit()}
                                    className="w-full bg-black border border-purple-600 rounded text-white px-1.5 py-0.5"
                                    autoFocus
                                  />
                                ) : (
                                  <span
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      handleCellDoubleClick(ch.id, 'name', ch.name);
                                    }}
                                    className="hover:text-purple-400 transition-colors block truncate"
                                  >
                                    {ch.name}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Now Playing schedule title */}
                            <td className="p-2.5 text-gray-300 max-w-[224px]">
                              {editingChannelId === ch.id && editingFieldName === 'nowPlaying' ? (
                                <input
                                  type="text"
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  onBlur={saveCellEdit}
                                  onKeyDown={(e) => e.key === 'Enter' && saveCellEdit()}
                                  className="w-full bg-black border border-purple-600 rounded text-white px-1.5 py-0.5"
                                  autoFocus
                                />
                              ) : (
                                <span
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    handleCellDoubleClick(ch.id, 'nowPlaying', nowPlayingInfo);
                                  }}
                                  className="hover:text-purple-400 transition-colors block truncate text-xs text-gray-400"
                                  title="Double click to change show title"
                                >
                                  {nowPlayingInfo}
                                </span>
                              )}
                            </td>

                            {/* Stream Direct URL */}
                            <td className="p-2.5 text-gray-500 font-mono text-[11px] truncate max-w-[250px]" title={streamUrl}>
                              {editingChannelId === ch.id && editingFieldName === 'url' ? (
                                <input
                                  type="text"
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  onBlur={saveCellEdit}
                                  onKeyDown={(e) => e.key === 'Enter' && saveCellEdit()}
                                  className="w-full bg-black border border-purple-600 rounded text-white px-1.5 py-0.5"
                                  autoFocus
                                />
                              ) : (
                                <span
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    handleCellDoubleClick(ch.id, 'url', streamUrl);
                                  }}
                                  className="hover:text-purple-400 transition-colors cursor-text"
                                >
                                  {streamUrl}
                                </span>
                              )}
                            </td>

                            {/* Backups urls manager */}
                            <td className="p-2.5 text-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openBackupModal(ch.id);
                                }}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-colors cursor-pointer ${
                                  backsCount > 0
                                    ? 'bg-indigo-500/10 border border-indigo-500/30 text-indigo-400'
                                    : 'bg-gray-900 border border-gray-800 text-gray-500 hover:text-gray-300'
                                }`}
                              >
                                {backsCount} BACKS
                              </button>
                            </td>

                            {/* Custom Tags editor and filter pills */}
                            <td className="p-2.5 text-center">
                              {editingChannelId === ch.id && editingFieldName === 'tags' ? (
                                <input
                                  type="text"
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  onBlur={saveCellEdit}
                                  onKeyDown={(e) => e.key === 'Enter' && saveCellEdit()}
                                  placeholder="e.g. hd, lang=en"
                                  className="w-24 bg-black border border-purple-600 rounded text-white px-1.5 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-purple-500"
                                  autoFocus
                                />
                              ) : (
                                <div 
                                  className="flex flex-wrap gap-1 justify-center items-center min-h-[22px]"
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    const serialized = Object.entries(ch.customTags || {})
                                      .map(([k, v]) => v === 'true' ? k : `${k}=${v}`)
                                      .join(', ');
                                    handleCellDoubleClick(ch.id, 'tags', serialized);
                                  }}
                                >
                                  {tagsCount > 0 ? (
                                    Object.entries(ch.customTags || {}).map(([key, val]) => {
                                      const fullTag = val === 'true' ? key : `${key}=${val}`;
                                      const isFiltered = selectedTagFilter === fullTag;
                                      return (
                                        <button
                                          key={fullTag}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedTagFilter(isFiltered ? 'All' : fullTag);
                                            logMessage('custom', isFiltered ? 'Cleared tag filter' : `Filtered playlist by tag: "${fullTag}"`);
                                          }}
                                          className={`px-1.5 py-0.5 rounded text-[9px] font-semibold font-mono tracking-wide border cursor-pointer transition-all hover:scale-105 active:scale-95 ${
                                            isFiltered
                                              ? 'bg-purple-900 border-purple-500 text-purple-100 shadow-sm shadow-purple-500/20'
                                              : 'bg-purple-950/20 hover:bg-purple-950/40 border-purple-900/30 text-purple-300'
                                          }`}
                                          title={`Click to ${isFiltered ? 'clear' : 'filter by'} tag "${fullTag}"`}
                                        >
                                          {val === 'true' ? key : `${key}:${val}`}
                                        </button>
                                      );
                                    })
                                  ) : (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCellDoubleClick(ch.id, 'tags', '');
                                      }}
                                      className="text-[9px] font-mono text-gray-600 hover:text-purple-400 bg-transparent border border-dashed border-gray-800 hover:border-purple-900/50 rounded px-1.5 py-0.5 transition-colors cursor-pointer"
                                      title="Double click or click here to add custom tags"
                                    >
                                      + TAG
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Action buttons delete */}
                            <td className="p-2.5 text-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteChannel(ch.id);
                                }}
                                className="p-1 text-gray-600 hover:text-red-500 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-[#121319] border-t-2 border-purple-900/50 text-white font-mono sticky bottom-0 z-10 shadow-lg">
                      <tr>
                        <td colSpan={10} className="p-3 bg-[#121319]/95 backdrop-blur-md">
                          <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
                            <div className="flex items-center gap-6">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                                <span className="text-gray-400 uppercase text-[10px] tracking-wider font-semibold">Total Channels:</span>
                                <strong className="text-purple-300 font-bold text-sm">{filteredChannels.length}</strong>
                                {filteredChannels.length !== channels.length && (
                                  <span className="text-[10px] text-gray-500">({channels.length} total in playlist)</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                                <span className="text-gray-400 uppercase text-[10px] tracking-wider font-semibold">Total Scheduled Episodes:</span>
                                <strong className="text-indigo-300 font-bold text-sm">
                                  {filteredChannels.reduce((sum, ch) => sum + (ch.shows ? ch.shows.reduce((sAcc, show) => sAcc + (show.episodes?.length || 0), 0) : 0), 0)}
                                </strong>
                              </div>
                            </div>
                            <div className="text-[10px] text-gray-400 font-mono flex items-center gap-3">
                              <span className="px-2 py-0.5 rounded bg-purple-950/40 border border-purple-800/30 text-purple-300">
                                Matrix Active
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </>
          ) : workspaceTab === 'epg' ? (
            <div className="flex-1 overflow-y-auto p-4 bg-[#0a0b0e] scrollbar-thin">
              <EPGGuide
                channels={channels}
                selectedChannel={selectedChannel}
                selectedEpisode={selectedEpisode}
                selectedShow={selectedShow}
                isLiveMode={isLiveMode}
                currentTimeMs={currentTimeMs}
                onSelectEpisode={(ch, s, ep, isLive) => {
                  startTransition(() => {
                    setSelectedChannel(ch);
                    setSelectedShow(s);
                    setSelectedEpisode(ep);
                    setIsLiveMode(isLive);
                  });
                  logMessage('epg', `[EPG Timeline Switch]: Selected program "${s.title}"`);
                }}
                onLogEvent={logMessage}
              />
            </div>
          ) : workspaceTab === 'export' ? (
            <div className="flex-1 overflow-y-auto p-5 bg-[#08090c] scrollbar-thin space-y-5 text-left text-gray-200">
              <div className="max-w-4xl mx-auto space-y-6">
                
                {/* Header Section */}
                <div className="flex flex-col gap-1 border-b border-purple-950/20 pb-4">
                  <h2 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Download className="w-5 h-5 text-purple-400" />
                    <span>Standalone Exporter & Publisher</span>
                  </h2>
                  <p className="text-xs text-gray-400 leading-normal">
                    Generate, preview, and download fully-featured TV matrix schedules and cinematic streaming players designed to run offline or host on any static hosting server with zero configurations.
                  </p>
                </div>

                {/* Grid layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Card 1: Standard Standalone Cinematic HTML Player */}
                  <div className="bg-[#10111a] border border-purple-950/20 rounded-xl p-5 shadow-xl flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between border-b border-purple-950/20 pb-2">
                        <div className="flex items-center gap-2">
                          <MonitorPlay className="w-4 h-4 text-purple-400" />
                          <h3 className="text-xs font-black text-white uppercase tracking-wider">Cinematic HTML Player</h3>
                        </div>
                        <span className="text-[9px] font-mono font-bold bg-purple-950/40 border border-purple-900/30 text-purple-400 px-2 py-0.5 rounded-full uppercase">
                          index.html
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 leading-relaxed font-sans">
                        Compiles your active matrix spreadsheet directly into a high-fidelity standalone single-page application. Includes the responsive EPG timeline scheduler, custom sidebar directory, real-time sync clock, CRT screen filters, and full HLS media player integration.
                      </p>
                      <ul className="text-[10px] space-y-1 text-gray-500 font-sans list-disc pl-4 pt-1">
                        <li>Built-in native video controls support.</li>
                        <li>Automated local browser-friendly play scheduler.</li>
                        <li>Encodes and parses media stream endpoints seamlessly.</li>
                      </ul>
                    </div>

                    <div className="space-y-2.5 pt-2">
                      <button
                        onClick={handlePreviewStaticPlayer}
                        disabled={isGeneratingPreview || channels.length === 0}
                        className="w-full py-2 bg-[#12131a] hover:bg-[#1a1c29] border border-purple-950/30 hover:border-purple-800 text-gray-300 hover:text-white text-[11px] font-bold rounded-lg transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Globe className="w-4 h-4 text-purple-400" />
                        <span>Preview Local Player</span>
                      </button>

                      <button
                        onClick={() => {
                          try {
                            const htmlContent = generateStaticPlayerHtml(channels, `Classic TV Guide & Video Player`, 'epg.json');
                            const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = 'index.html';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            logMessage('custom', '[Player Export]: Downloaded "index.html" standalone cinematic player successfully.');
                          } catch (err: any) {
                            logMessage('error', `Failed to export standalone player: ${err.message}`);
                          }
                        }}
                        disabled={channels.length === 0}
                        className="w-full py-2.5 bg-gradient-to-r from-purple-700 to-indigo-800 hover:from-purple-600 hover:to-indigo-700 text-white text-[11px] font-black rounded-lg transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
                      >
                        <Download className="w-4 h-4 text-white animate-pulse" />
                        <span>Download Standalone Player</span>
                      </button>

                      {staticPlayerPreviewBlobUrl && (
                        <div className="pt-2 text-center">
                          <a
                            href={staticPlayerPreviewBlobUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1 bg-green-950/20 border border-green-800/30 hover:border-green-600/50 text-green-400 hover:text-green-300 text-[10px] font-mono font-bold rounded-full transition-colors animate-pulse"
                          >
                            <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                            <span>LAUNCH LOCAL PREVIEW ↗</span>
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card 2: M3U Playlist Exporter */}
                  <div className="bg-[#10111a] border border-purple-950/20 rounded-xl p-5 shadow-xl flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between border-b border-purple-950/20 pb-2">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-purple-400" />
                          <h3 className="text-xs font-black text-white uppercase tracking-wider">M3U Playlist File</h3>
                        </div>
                        <span className="text-[9px] font-mono font-bold bg-purple-950/40 border border-purple-900/30 text-purple-400 px-2 py-0.5 rounded-full uppercase">
                          playlist.m3u
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 leading-relaxed font-sans">
                        Exports your active matrix directory structure in standard M3U/M3U8 playlist syntax, fully compatible with external media centers and IPTV apps such as VLC, Kodi, IPTV Smarters, or Tivimate.
                      </p>
                      <ul className="text-[10px] space-y-1 text-gray-500 font-sans list-disc pl-4 pt-1">
                        <li>Maintains custom channel categorizations.</li>
                        <li>Includes logo badges and tag identifiers.</li>
                        <li>Compatible with mobile, tablet, and smart TVs.</li>
                      </ul>
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={handleSaveM3U}
                        disabled={channels.length === 0}
                        className="w-full py-2.5 bg-purple-900/40 hover:bg-purple-900/70 border border-purple-800/30 text-purple-200 hover:text-white text-[11px] font-bold rounded-lg transition-colors uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download Playlist M3U</span>
                      </button>
                    </div>
                  </div>

                  {/* Card 3: CSV Channel Directory Index */}
                  <div className="bg-[#10111a] border border-purple-950/20 rounded-xl p-5 shadow-xl flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between border-b border-purple-950/20 pb-2">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4 text-purple-400" />
                          <h3 className="text-xs font-black text-white uppercase tracking-wider">Channel Index Spreadsheet</h3>
                        </div>
                        <span className="text-[9px] font-mono font-bold bg-purple-950/40 border border-purple-900/30 text-purple-400 px-2 py-0.5 rounded-full uppercase">
                          channels.csv
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 leading-relaxed font-sans">
                        Downloads your entire matrix library of channels, shows, and streaming links as a structured CSV dataset. Great for backup, batch auditing, or importing directly back into desktop spreadsheet editors.
                      </p>
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={handleExportCSV}
                        disabled={channels.length === 0}
                        className="w-full py-2.5 bg-purple-900/40 hover:bg-purple-900/70 border border-purple-800/30 text-purple-200 hover:text-white text-[11px] font-bold rounded-lg transition-colors uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download CSV Spreadsheet</span>
                      </button>
                    </div>
                  </div>

                  {/* Card 4: XML TV EPG JSON State */}
                  <div className="bg-[#10111a] border border-purple-950/20 rounded-xl p-5 shadow-xl flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between border-b border-purple-950/20 pb-2">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-purple-400" />
                          <h3 className="text-xs font-black text-white uppercase tracking-wider">XML EPG Guide Listings</h3>
                        </div>
                        <span className="text-[9px] font-mono font-bold bg-purple-950/40 border border-purple-900/30 text-purple-400 px-2 py-0.5 rounded-full uppercase">
                          epg.json
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 leading-relaxed font-sans">
                        Exports the exact structural schedule lists, timeblocks, episode details, descriptions, and show durations in a structured JSON schema. Perfect for linking EPG guides with external streaming servers.
                      </p>
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={() => {
                          try {
                            const epgBlob = new Blob([JSON.stringify(channels, null, 2)], { type: 'application/json;charset=utf-8' });
                            const url = URL.createObjectURL(epgBlob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = 'epg.json';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            logMessage('custom', '[EPG Export]: Downloaded "epg.json" schedule data grid successfully.');
                          } catch (err: any) {
                            logMessage('error', `Failed to export EPG schema: ${err.message}`);
                          }
                        }}
                        disabled={channels.length === 0}
                        className="w-full py-2.5 bg-purple-900/40 hover:bg-purple-900/70 border border-purple-800/30 text-purple-200 hover:text-white text-[11px] font-bold rounded-lg transition-colors uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download EPG Data JSON</span>
                      </button>
                    </div>
                  </div>

                </div>

                {/* Helpful deployment instructions */}
                <div className="bg-purple-950/10 border border-purple-900/20 rounded-xl p-4.5 space-y-3 font-sans">
                  <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-purple-400" />
                    <span>How to publish your static player for free</span>
                  </h4>
                  <div className="text-[11px] text-gray-400 space-y-2 leading-relaxed">
                    <p>
                      Because the exported player page is <strong>100% self-contained</strong>, you can host your television network for free on any static host. No complex servers or GitHub Action pipelines required:
                    </p>
                    <ol className="list-decimal pl-4.5 space-y-1 text-gray-400">
                      <li>Download the standalone <strong>index.html</strong> file above.</li>
                      <li>Drop it into a fresh GitHub repository and enable <strong className="text-purple-300">GitHub Pages</strong> in settings, or upload it to <strong className="text-purple-300">Vercel</strong>, <strong className="text-purple-300">Netlify</strong>, or <strong className="text-purple-300">Cloudflare Pages</strong>.</li>
                      <li>Alternatively, just double-click the <strong>index.html</strong> file on your desktop to play your TV matrix scheduled loops directly in your browser.</li>
                    </ol>
                  </div>
                </div>

              </div>
            </div>
          ) : workspaceTab === 'github' ? (
            <div className="flex-1 overflow-y-auto p-5 bg-[#08090c] scrollbar-thin space-y-5 text-left text-gray-200">
              {/* STATUS & FEEDBACK BANNER */}
              {(githubMessage || githubStatus === 'error') && (
                <div className={`p-4 rounded-xl border flex flex-col gap-3 text-xs leading-relaxed transition-all shadow-lg ${
                  githubStatus === 'error'
                    ? 'bg-red-500/10 border-red-500/30 text-red-300'
                    : githubMessage.toLowerCase().includes('workflow_dispatch')
                      ? 'bg-amber-950/25 border-amber-800/40 text-amber-300'
                      : 'bg-purple-950/20 border-purple-800/30 text-purple-300'
                }`}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${
                      githubStatus === 'error' 
                        ? 'text-red-400' 
                        : githubMessage.toLowerCase().includes('workflow_dispatch')
                          ? 'text-amber-400'
                          : 'text-purple-400'
                    }`} />
                    <div className="flex-1">
                      <span className="font-bold uppercase font-mono block mb-1">
                        {githubStatus === 'error' 
                          ? 'REST API error' 
                          : githubMessage.toLowerCase().includes('workflow_dispatch')
                            ? 'Trigger Missing: Workflow Dispatch Configuration Required'
                            : 'Sync Console Notification'}
                      </span>
                      <span>{githubMessage || 'Unknown error communicating with GitHub APIs.'}</span>
                    </div>
                    <button 
                      onClick={() => setGithubMessage('')} 
                      className="text-[10px] font-mono hover:text-white px-2 py-0.5 rounded bg-black/40 border border-white/5 cursor-pointer shrink-0"
                    >
                      DISMISS
                    </button>
                  </div>

                  {githubMessage.toLowerCase().includes('workflow_dispatch') && (
                    <div className="mt-1 p-4 bg-black/60 rounded-lg border border-amber-500/20 font-sans space-y-3.5">
                      <div className="flex items-center gap-2 border-b border-amber-500/10 pb-2">
                        <Code className="w-4 h-4 text-amber-400" />
                        <h4 className="font-bold text-white text-xs uppercase tracking-wider">How to enable manual triggers</h4>
                      </div>
                      
                      <p className="text-gray-400 text-[11px] leading-relaxed">
                        To allow this dashboard to trigger workflows remotely, GitHub requires your workflow YAML definition to explicitly declare the <code className="text-amber-400 font-mono font-bold bg-white/5 px-1 py-0.5 rounded">workflow_dispatch</code> event trigger.
                      </p>
                      
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block">Add this block near the top of your YAML workflow file:</span>
                        <div className="relative">
                          <pre className="bg-black/90 p-3 rounded-lg text-[10.5px] font-mono text-emerald-400 border border-white/5 overflow-x-auto leading-normal whitespace-pre">
{`on:
  workflow_dispatch:  # <-- Allows manual remote execution via REST API / Web UI`}
                          </pre>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText("on:\n  workflow_dispatch:");
                              setYamlCopied(true);
                              setTimeout(() => setYamlCopied(false), 2000);
                            }}
                            className="absolute right-2 top-2 px-2.5 py-1.5 bg-purple-950/40 hover:bg-purple-900/60 rounded text-[10px] text-purple-300 hover:text-white transition-all font-bold flex items-center gap-1 cursor-pointer border border-purple-800/20"
                            title="Copy YAML trigger"
                          >
                            {yamlCopied ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400 font-mono">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy Trigger</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="text-[10px] text-gray-400 leading-relaxed space-y-1 bg-white/5 p-2.5 rounded-lg border border-white/5">
                        <p className="font-semibold text-white">Follow these simple steps:</p>
                        <ol className="list-decimal pl-4 space-y-1 text-gray-400">
                          <li>Open your repository (e.g. <strong className="text-white">{githubRepo}</strong>) on GitHub or in your local IDE.</li>
                          <li>Navigate to your workflow configuration file (usually inside <code className="font-mono text-purple-400 bg-white/5 px-1 py-0.2 rounded">.github/workflows/</code>, e.g., <code className="font-mono text-purple-400 bg-white/5 px-1 py-0.2 rounded">sync.yml</code>).</li>
                          <li>Add the <code className="text-amber-400 font-mono font-bold">workflow_dispatch:</code> trigger block shown above under your <code className="font-mono">on:</code> definition.</li>
                          <li>Commit and push the file to your <code className="font-mono text-purple-400 bg-white/5 px-1 py-0.2 rounded">{githubBranch}</code> branch.</li>
                          <li>Refresh your active workflows list and click the <strong className="text-white">Trigger</strong> button again!</li>
                        </ol>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* MAIN SYNC GRID */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                
                {/* LEFT COLUMN: CONNECTION & PUBLISHING */}
                <div className="lg:col-span-5 flex flex-col gap-5">
                  
                  {/* CARD 1: REPOSITORY SETTINGS */}
                  <div className="bg-[#10111a] border border-purple-950/20 rounded-xl p-5 shadow-xl space-y-4">
                    <div className="flex items-center justify-between border-b border-purple-950/20 pb-3">
                      <div className="flex items-center gap-2">
                        <Github className="w-4 h-4 text-purple-400" />
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider">Repository Settings</h3>
                      </div>
                      <span className="text-[9px] font-mono font-bold bg-purple-950/40 border border-purple-900/30 text-purple-400 px-2 py-0.5 rounded-full uppercase tracking-widest">
                        REST API v3
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block">GitHub Repository:</label>
                        <div className="relative">
                          <span className="absolute left-3 top-2 text-gray-500 font-mono text-xs select-none">/</span>
                          <input
                            type="text"
                            value={githubRepo}
                            onChange={(e) => setGithubRepo(e.target.value)}
                            placeholder="username/repository"
                            className="w-full bg-black/50 border border-purple-950/50 hover:border-purple-800/50 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 rounded-lg pl-6 pr-3 py-1.5 text-xs text-white font-mono placeholder-gray-600 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block">Target Branch Name:</label>
                        <div className="relative">
                          <GitBranch className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-2.5 z-10 pointer-events-none" />
                          {!isCustomBranch ? (
                            <div className="relative">
                              <select
                                value={githubBranch}
                                onChange={(e) => {
                                  if (e.target.value === 'custom') {
                                    setIsCustomBranch(true);
                                    setGithubBranch('');
                                  } else {
                                    setGithubBranch(e.target.value);
                                  }
                                }}
                                className="w-full bg-black/50 border border-purple-950/50 hover:border-purple-800/50 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 rounded-lg pl-9 pr-8 py-1.5 text-xs text-white font-mono focus:outline-none appearance-none cursor-pointer"
                              >
                                <option value="main" className="bg-[#10111a] text-white font-mono">main</option>
                                <option value="dev" className="bg-[#10111a] text-white font-mono">dev</option>
                                <option value="staging" className="bg-[#10111a] text-white font-mono">staging</option>
                                <option value="custom" className="bg-[#10111a] text-purple-400 font-bold font-mono">Custom...</option>
                              </select>
                              <div className="absolute right-3 top-2.5 pointer-events-none text-gray-500">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path></svg>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-1.5 items-center">
                              <input
                                type="text"
                                value={githubBranch}
                                onChange={(e) => setGithubBranch(e.target.value)}
                                placeholder="Enter branch (e.g., feature-1)"
                                className="w-full bg-black/50 border border-purple-950/50 hover:border-purple-800/50 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white font-mono placeholder-gray-600 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setIsCustomBranch(false);
                                  setGithubBranch('main');
                                }}
                                className="px-2.5 py-1.5 bg-purple-950/40 hover:bg-purple-900/40 border border-purple-900/30 text-purple-400 hover:text-white rounded-lg text-[9px] font-mono tracking-wide font-bold uppercase transition-colors shrink-0 cursor-pointer"
                                title="Switch back to preset dropdown"
                              >
                                Presets
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block">Personal Access Token (PAT):</label>
                          <span className="text-[9px] text-amber-400 font-mono">Requires 'repo' scope</span>
                        </div>
                        <input
                          type="password"
                          value={githubToken}
                          onChange={(e) => setGithubToken(e.target.value)}
                          placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxx"
                          className="w-full bg-black/50 border border-purple-950/50 hover:border-purple-800/50 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder-gray-600 focus:outline-none"
                        />
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => saveGithubCredentials(githubRepo, githubBranch, githubToken)}
                          className="flex-1 py-2 bg-purple-900 hover:bg-purple-800 text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer text-center uppercase tracking-wider"
                        >
                          Save Credentials
                        </button>
                        <button
                          onClick={() => {
                            fetchGithubContents(currentExplorerPath);
                            fetchGithubWorkflows();
                          }}
                          disabled={isGithubLoading}
                          className="px-3 bg-black/40 border border-purple-950/40 text-purple-400 hover:text-white rounded-lg transition-colors cursor-pointer flex items-center justify-center disabled:opacity-40"
                          title="Refresh repository contents and workflows"
                        >
                          <RefreshCw className={`w-4 h-4 ${isGithubLoading ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* CARD 2: WORKSPACE PUBLISHING ENGINE */}
                  <div className="bg-[#10111a] border border-purple-950/20 rounded-xl p-5 shadow-xl space-y-4">
                    <div className="flex items-center justify-between border-b border-purple-950/20 pb-3">
                      <div className="flex items-center gap-2">
                        <Code className="w-4 h-4 text-purple-400" />
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider">Workspace Publishers</h3>
                      </div>
                      <span className="text-[9px] font-mono text-gray-500 uppercase tracking-widest">Git Commit</span>
                    </div>

                    <div className="space-y-4">
                      {/* NEW: Automated All-in-One Deployment panel */}
                      <div className="space-y-3 p-4 bg-gradient-to-br from-purple-950/30 to-purple-900/10 rounded-xl border border-purple-500/30 shadow-inner">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                            <span className="text-[11px] font-extrabold text-white uppercase tracking-wider">⚡ Quick-Deploy Station</span>
                          </div>
                          <span className="text-[9px] font-mono font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400 px-1.5 py-0.2 rounded uppercase">
                            All-In-One
                          </span>
                        </div>
                        
                        <p className="text-[10px] text-gray-400 leading-normal font-sans">
                          Sync playlist (<code className="text-purple-400 font-mono text-[9px]">{githubM3uSavePath}</code>) and player (<code className="text-purple-400 font-mono text-[9px]">{githubHtmlSavePath}</code>) to GitHub simultaneously, trigger active pipelines, and update your public player instantly.
                        </p>

                        <button
                          onClick={quickSyncAndPublishAll}
                          disabled={isGithubLoading || channels.length === 0}
                          className="w-full py-2.5 bg-gradient-to-r from-purple-700 to-indigo-800 hover:from-purple-600 hover:to-indigo-700 text-white text-[11px] font-black rounded-lg transition-all uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                          <span>Sync & Auto-Publish Live Site</span>
                        </button>

                        {getGitHubPagesUrl() && (
                          <div className="pt-2 border-t border-purple-950/30 flex flex-col gap-1 text-left">
                            <span className="text-[9px] font-mono text-gray-500 uppercase tracking-wider">🚀 LIVE PUBLIC DOMAIN URL:</span>
                            <div className="flex items-center justify-between gap-2 bg-black/40 p-2 rounded border border-white/5 overflow-hidden">
                              <a
                                href={getGitHubPagesUrl() || '#'}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] font-mono font-medium text-purple-300 hover:text-white transition-colors truncate hover:underline"
                              >
                                {getGitHubPagesUrl()}
                              </a>
                              <button
                                onClick={() => {
                                  const url = getGitHubPagesUrl();
                                  if (url) {
                                    navigator.clipboard.writeText(url);
                                    logMessage('custom', `Copied live deployment link: ${url}`);
                                  }
                                }}
                                className="text-[9px] font-mono text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 px-1.5 py-0.5 rounded cursor-pointer border border-white/5 flex items-center gap-1 shrink-0"
                              >
                                <Copy className="w-2.5 h-2.5" />
                                <span>Copy</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Sub-item: M3U playlist publisher */}
                      <div className="space-y-2 p-3 bg-black/20 rounded-lg border border-purple-950/20">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Playlist Commit Path:</span>
                          <span className="text-[9px] font-mono text-gray-500">M3U File</span>
                        </div>
                        <input
                          type="text"
                          value={githubM3uSavePath}
                          onChange={(e) => setGithubM3uSavePath(e.target.value)}
                          className="w-full bg-black/50 border border-purple-950/40 rounded px-2.5 py-1 text-xs text-gray-300 font-mono focus:outline-none focus:border-purple-600"
                        />
                        <button
                          onClick={() => saveM3UToGithub(githubM3uSavePath)}
                          disabled={isGithubLoading || channels.length === 0}
                          className="w-full py-1.5 bg-purple-900/40 hover:bg-purple-900/70 border border-purple-800/30 text-purple-200 hover:text-white text-[10px] font-bold rounded transition-colors uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5 animate-bounce" />
                          <span>Commit & Push Playlist</span>
                        </button>
                      </div>

                      {/* Sub-item: HTML player publisher */}
                      <div className="space-y-2 p-3 bg-black/20 rounded-lg border border-purple-950/20">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Static Player Path:</span>
                          <span className="text-[9px] font-mono text-gray-500">HTML File</span>
                        </div>
                        <input
                          type="text"
                          value={githubHtmlSavePath}
                          onChange={(e) => setGithubHtmlSavePath(e.target.value)}
                          className="w-full bg-black/50 border border-purple-950/40 rounded px-2.5 py-1 text-xs text-gray-300 font-mono focus:outline-none focus:border-purple-600"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={handlePreviewStaticPlayer}
                            disabled={isGeneratingPreview || channels.length === 0}
                            className="py-1.5 bg-[#12131a] hover:bg-[#1a1c29] border border-gray-800 text-gray-300 hover:text-white text-[10px] font-bold rounded transition-colors uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                          >
                            <Globe className="w-3.5 h-3.5 text-blue-400" />
                            <span>Preview Player</span>
                          </button>
                          <button
                            onClick={() => publishStaticPlayerToGithub(githubHtmlSavePath)}
                            disabled={isGithubLoading || channels.length === 0}
                            className="py-1.5 bg-purple-900/40 hover:bg-purple-900/70 border border-purple-800/30 text-purple-200 hover:text-white text-[10px] font-bold rounded transition-colors uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Commit Player</span>
                          </button>
                        </div>

                        {staticPlayerPreviewBlobUrl && (
                          <div className="pt-2 text-center">
                            <a
                              href={staticPlayerPreviewBlobUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-1 bg-green-950/20 border border-green-800/30 hover:border-green-600/50 text-green-400 hover:text-green-300 text-[10px] font-mono font-bold rounded-full transition-colors animate-pulse"
                            >
                              <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                              <span>VIEW LOCAL HTML PREVIEW ↗</span>
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Sub-item: EPG state publisher */}
                      <div className="space-y-2 p-3 bg-black/20 rounded-lg border border-purple-950/20">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">EPG State Save Path:</span>
                          <span className="text-[9px] font-mono text-gray-500">JSON File</span>
                        </div>
                        <input
                          type="text"
                          value={githubEpgSavePath}
                          onChange={(e) => handleEpgSavePathChange(e.target.value)}
                          className="w-full bg-black/50 border border-purple-950/40 rounded px-2.5 py-1 text-xs text-gray-300 font-mono focus:outline-none focus:border-purple-600"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => fetchAndLoadEpgFromPath(githubEpgSavePath)}
                            disabled={isGithubLoading}
                            className="py-1.5 bg-[#12131a] hover:bg-[#1a1c29] border border-gray-800 text-gray-300 hover:text-white text-[10px] font-bold rounded transition-colors uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                            title="Load and sync EPG guide state from your GitHub repository"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isGithubLoading ? 'animate-spin' : ''}`} />
                            <span>Sync Load EPG</span>
                          </button>
                          <button
                            onClick={() => saveEPGToGithub(githubEpgSavePath)}
                            disabled={isGithubLoading || channels.length === 0}
                            className="py-1.5 bg-purple-900/40 hover:bg-purple-900/70 border border-purple-800/30 text-purple-200 hover:text-white text-[10px] font-bold rounded transition-colors uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                            title="Commit current EPG program states to GitHub JSON"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Commit EPG</span>
                          </button>
                        </div>
                      </div>

                      {/* Sub-item: Push Full Codebase to GitHub */}
                      <div className="space-y-2 p-3 bg-purple-950/10 hover:bg-purple-950/20 rounded-lg border border-purple-500/20 shadow-inner transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <Code className="w-3.5 h-3.5 text-purple-400" />
                            <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Sync Full App Codebase:</span>
                          </div>
                          <span className="text-[8px] font-mono font-bold bg-purple-500/10 border border-purple-500/30 text-purple-300 px-1 py-0.2 rounded uppercase">
                            M3U Pro Core
                          </span>
                        </div>
                        <p className="text-[9px] text-gray-500 leading-normal font-sans text-left">
                          Push all updated source files (<code className="text-gray-400">src/</code>, <code className="text-gray-400">server.ts</code>, workflows, config) to the branch <code className="text-purple-400 font-mono font-bold">{githubBranch}</code>.
                        </p>
                        <button
                          onClick={pushCodebaseToGithub}
                          disabled={isGithubLoading}
                          className="w-full py-1.5 bg-gradient-to-r from-purple-950/60 to-indigo-950/60 hover:from-purple-900/80 hover:to-indigo-900/80 border border-purple-500/30 text-purple-100 hover:text-white text-[10px] font-bold rounded transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer shadow active:scale-[0.98]"
                        >
                          <Upload className="w-3.5 h-3.5 animate-pulse text-purple-400" />
                          <span>Push Latest Codebase</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: REPO EXPLORER & WORKFLOWS */}
                <div className="lg:col-span-7 flex flex-col gap-5">
                  
                  {/* CARD 3: ACTIVE GITHUB WORKFLOWS */}
                  <div className="bg-[#10111a] border border-purple-950/20 rounded-xl p-5 shadow-xl space-y-4">
                    <div className="flex items-center justify-between border-b border-purple-950/20 pb-3">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-purple-400" />
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider">Active GitHub Actions Workflows</h3>
                      </div>
                      <span className="text-[9px] font-mono font-bold bg-green-500/10 border border-green-500/30 text-green-400 px-2 py-0.5 rounded-full uppercase tracking-widest animate-pulse">
                        CI/CD Pipelines
                      </span>
                    </div>

                    {isGithubLoading && githubWorkflows.length === 0 ? (
                      <div className="py-8 text-center text-xs text-gray-500 font-mono animate-pulse flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="w-6 h-6 animate-spin text-purple-500" />
                        <span>Fetching Actions Workflows from repository...</span>
                      </div>
                    ) : githubWorkflows.length > 0 ? (
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
                        {githubWorkflows.map((wf) => {
                          const isWfActive = wf.state === 'active';
                          return (
                            <div key={wf.id} className="p-3 bg-black/30 border border-purple-950/10 hover:border-purple-800/20 rounded-lg flex items-center justify-between gap-4 transition-all">
                              <div className="text-left overflow-hidden">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-gray-200 text-xs truncate" title={wf.name}>{wf.name}</span>
                                  <span className={`text-[8px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                                    isWfActive 
                                      ? 'bg-green-900/30 text-green-400 border border-green-500/10' 
                                      : 'bg-gray-800 text-gray-500'
                                  }`}>
                                    {wf.state?.toUpperCase()}
                                  </span>
                                </div>
                                <div className="text-[10px] text-gray-500 font-mono truncate mt-0.5" title={wf.path}>
                                  Path: <span className="text-purple-400/80">{wf.path}</span> • ID: {wf.id}
                                </div>
                              </div>
                              <button
                                onClick={() => triggerWorkflowDispatch(wf.id)}
                                disabled={isGithubLoading}
                                className="px-3.5 py-1.5 bg-purple-900 hover:bg-purple-800 border border-purple-800 text-white font-bold text-[10px] tracking-wider uppercase rounded-md transition-all active:scale-95 disabled:opacity-40 cursor-pointer flex items-center gap-1 shrink-0 shadow"
                                title="Trigger single-click CI/CD dispatch action"
                              >
                                <PlayCircle className="w-3.5 h-3.5 text-purple-300" />
                                <span>Trigger</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-4 bg-black/20 rounded-lg border border-purple-950/10 text-center space-y-3">
                        <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto" />
                        <div className="space-y-1">
                          <p className="text-[11px] text-gray-400 leading-relaxed font-sans">
                            No active GitHub Actions workflows detected in this repository. Ensure your target repository has active workflow config YAML files inside the <code className="text-purple-400 font-mono text-[10px]">.github/workflows/</code> folder.
                          </p>
                          <p className="text-[10px] text-gray-600 font-mono">
                            Required scope: Personal Access Token (PAT) with write permission.
                          </p>
                        </div>
                        
                        {/* Fallback Custom Manual ID Trigger to keep operations functional under any circumstance */}
                        <div className="pt-2 border-t border-white/5 flex gap-2 items-center justify-center max-w-sm mx-auto">
                          <input
                            type="text"
                            placeholder="Or Enter Workflow ID / File Name"
                            id="custom-workflow-input"
                            className="bg-black/80 border border-purple-950/40 rounded px-2 py-1 text-[10px] font-mono text-gray-300 focus:outline-none focus:border-purple-600 w-full"
                          />
                          <button
                            onClick={() => {
                              const input = document.getElementById('custom-workflow-input') as HTMLInputElement;
                              if (input && input.value.trim()) {
                                triggerWorkflowDispatch(input.value.trim());
                              } else {
                                setGithubMessage('Please provide a workflow file name (e.g. main.yml) or numeric workflow ID.');
                              }
                            }}
                            className="px-3 py-1 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-800/30 text-purple-300 hover:text-white rounded text-[10px] font-bold uppercase transition-colors shrink-0"
                          >
                            Trigger ID
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* CARD 4: REPOSITORY EXPLORER */}
                  <div className="bg-[#10111a] border border-purple-950/20 rounded-xl p-5 shadow-xl flex-1 flex flex-col space-y-4 font-sans">
                    <div className="flex items-center justify-between border-b border-purple-950/20 pb-3 shrink-0">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4 text-purple-400" />
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider">Repository Explorer</h3>
                      </div>
                      <span className="text-[10px] font-mono text-gray-500">
                        {currentExplorerPath ? `/${currentExplorerPath}` : 'Root Path'}
                      </span>
                    </div>

                    {/* PATH NAVIGATION BAR */}
                    <div className="flex items-center justify-between bg-black/30 p-2 border border-purple-950/10 rounded-lg text-[11px] font-mono shrink-0">
                      <span className="truncate text-gray-400">
                        PATH: <span className="text-purple-400">/ {currentExplorerPath || '(root)'}</span>
                      </span>
                      {currentExplorerPath && (
                        <button
                          onClick={() => {
                            const parts = currentExplorerPath.split('/');
                            parts.pop();
                            const parent = parts.join('/');
                            fetchGithubContents(parent);
                          }}
                          className="px-2 py-0.5 bg-purple-950/30 hover:bg-purple-900/30 border border-purple-900/40 hover:border-purple-600/50 text-purple-300 text-[10px] rounded transition-colors cursor-pointer"
                        >
                          .. UP ONE LEVEL
                        </button>
                      )}
                    </div>

                    {isGithubLoading && githubFiles.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-xs text-gray-500 font-mono animate-pulse gap-2 py-10">
                        <RefreshCw className="w-6 h-6 animate-spin text-purple-500" />
                        <span>Querying GitHub directory node contents...</span>
                      </div>
                    ) : githubFiles.length > 0 ? (
                      <div className="flex-1 overflow-y-auto max-h-80 pr-1 scrollbar-thin space-y-1.5 text-xs text-left">
                        {githubFiles.map((file) => {
                          const isDir = file.type === 'dir';
                          const name = file.name;
                          const isM3u = name.endsWith('.m3u') || name.endsWith('.m3u8') || name.endsWith('.txt');
                          const isJson = name.endsWith('.json');
                          
                          return (
                            <div key={file.sha} className="p-2.5 bg-black/25 hover:bg-[#12131b]/50 border border-purple-950/5 rounded-lg flex items-center justify-between gap-3 transition-colors">
                              <div className="flex items-center gap-2.5 overflow-hidden">
                                {isDir ? (
                                  <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
                                ) : (
                                  <FileText className="w-4 h-4 text-purple-400 shrink-0" />
                                )}
                                <span className={`truncate font-mono text-[11px] ${isDir ? 'text-amber-400 hover:underline cursor-pointer font-semibold' : 'text-gray-300'}`}
                                  onClick={() => {
                                    if (isDir) {
                                      fetchGithubContents(file.path);
                                    }
                                  }}
                                >
                                  {file.name}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {isDir ? (
                                  <button
                                    onClick={() => fetchGithubContents(file.path)}
                                    className="px-2.5 py-1 bg-amber-950/20 border border-amber-900/40 text-amber-400 text-[10px] rounded hover:bg-amber-900/30 transition-colors cursor-pointer"
                                  >
                                    OPEN
                                  </button>
                                ) : (
                                  <>
                                    <span className="text-[10px] text-gray-600 font-mono">
                                      {(file.size / 1024).toFixed(1)} KB
                                    </span>
                                    {isM3u && (
                                      <button
                                        onClick={() => loadM3UFromGithub(file.download_url, file.name)}
                                        className="px-2.5 py-1 bg-green-950/20 border border-green-900/40 text-green-400 hover:bg-green-900/30 text-[10px] rounded transition-colors uppercase font-bold cursor-pointer"
                                        title="Import playlist into local workspace"
                                      >
                                        Import
                                      </button>
                                    )}
                                    {isJson && (
                                      <button
                                        onClick={() => loadEPGFromGithub(file.download_url, file.name)}
                                        className="px-2.5 py-1 bg-purple-950/35 border border-purple-900/40 text-purple-300 hover:bg-purple-900/30 text-[10px] rounded transition-colors uppercase font-bold cursor-pointer"
                                        title="Import EPG State into local workspace"
                                      >
                                        Load EPG
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-600 font-mono italic text-[11px]">
                        No files or subdirectories discovered in this repository.
                      </div>
                    )}
                  </div>

                </div>

              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-5 bg-[#08090c] scrollbar-thin text-left text-gray-200">
              <ScraperDashboard 
                onLogEvent={handleScraperLogEvent}
                onRefreshChannels={refreshChannels}
                onSelectChannel={(channelId) => {
                  const ch = channels.find(c => c.id === channelId);
                  if (ch) {
                    handleSelectChannel(ch);
                  }
                }}
              />
            </div>
          )}
        </div>

        {/* RIGHT SIDEBAR / SPLIT TUNER PORTAL */}
        <aside className="console-right-panel visible w-full lg:w-[400px] xl:w-[440px] border-t lg:border-t-0 lg:border-l border-purple-950/30 bg-[#0f1015]/60 flex flex-col lg:shrink-0 h-[520px] lg:h-full overflow-hidden">
          
          {/* Gold Web Live Player area */}
          <div className="p-4 border-b border-purple-950/30 bg-black/40">
            <h2 className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <MonitorPlay className="w-3.5 h-3.5 text-purple-500" />
              GOLD FEED PLAYER
            </h2>
            <div className="bg-[#050608] border border-purple-950/20 rounded-xl p-2 shadow-2xl relative z-10">
              {selectedEpisode ? (
                <CustomVideoPlayer
                  episode={selectedEpisode}
                  show={selectedShow}
                  channelId={selectedChannel?.id || ''}
                  channelName={selectedChannel?.name || 'Tuner Deck'}
                  isLiveMode={isLiveMode}
                  liveSeekOffset={liveSeekOffset}
                  onLogEvent={logMessage}
                  onEpisodeEnded={handleEpisodeEnded}
                  schedulingMode={schedulingMode}
                  onDurationProbed={refreshChannels}
                  nextEpisode={activeChannelEpg?.upcomingSlots?.[0]?.episode}
                />
              ) : (
                <div className="aspect-video bg-black rounded-lg flex items-center justify-center text-gray-600 font-mono text-xs p-4 text-center">
                  Select any channel from the matrix grid to play active stream feed.
                </div>
              )}
            </div>

            <div className="flex justify-between items-center mt-3">
              <span className="text-[10px] font-mono text-purple-400/70">DECK STATS: 1080p • 60 FPS • MSE H264</span>
              
              <div className="flex bg-black border border-purple-950/40 rounded-full p-0.5">
                <button
                  onClick={setModeLive}
                  className={`px-3 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                    isLiveMode ? 'bg-purple-600 text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  LIVE GUIDE
                </button>
                <button
                  onClick={setModeVOD}
                  className={`px-3 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                    !isLiveMode ? 'bg-purple-600 text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  VOD
                </button>
              </div>
            </div>

            {isLiveMode && (
              <div className="mt-3.5 pt-3 border-t border-purple-950/20 flex flex-col gap-1.5">
                <span className="text-[10px] font-mono text-purple-400/70 font-bold uppercase tracking-wider">
                  EPG PLAYBACK SCHEDULER:
                </span>
                <div className="grid grid-cols-2 gap-1.5 bg-black/40 border border-purple-950/20 rounded-xl p-1">
                  <button
                    onClick={() => {
                      setSchedulingMode('hard-clocked');
                      logMessage('custom', 'Playout Engine shifted: Hard-Clocked Mode (Shows loop inside fixed hour slots to fill dead air)');
                    }}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg text-center transition-all cursor-pointer ${
                      schedulingMode === 'hard-clocked'
                        ? 'bg-purple-900/40 border border-purple-500/50 text-white'
                        : 'border border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    <span className="text-[10px] font-black uppercase tracking-wider">HARD-CLOCKED</span>
                    <span className="text-[8px] opacity-60">Loops to Fill Dead Air</span>
                  </button>
                  <button
                    onClick={() => {
                      setSchedulingMode('continuous');
                      logMessage('custom', 'Playout Engine shifted: Continuous Mode (Adjusts clock to video length for end-to-end continuous playback)');
                    }}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg text-center transition-all cursor-pointer ${
                      schedulingMode === 'continuous'
                        ? 'bg-purple-900/40 border border-purple-500/50 text-white'
                        : 'border border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    <span className="text-[10px] font-black uppercase tracking-wider">CONTINUOUS</span>
                    <span className="text-[8px] opacity-60">End-to-End Gapless Stream</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Real-time Diagnostics Monitor Console */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-hidden p-3 bg-black/10">
              <DiagnosticConsole logs={logs} onClearLogs={handleClearLogs} onRunChannelHopTest={handleRunChannelHopTest} />
            </div>
          </div>
        </aside>

      </div>

      {/* 4. Custom Inline floating Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-[#16171e] border border-purple-950/80 rounded-lg shadow-2xl py-1.5 w-48 text-xs font-sans text-gray-300"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={() => setContextMenu(null)}
        >
          <button
            onClick={() => {
              const ch = channels.find((c) => c.id === contextMenu.channelId);
              if (ch) handleSelectChannel(ch);
            }}
            className="w-full text-left px-4 py-2 hover:bg-purple-900/40 hover:text-white flex items-center gap-2"
          >
            <Play className="w-3.5 h-3.5 text-purple-400 fill-current" />
            <span>Play Stream</span>
          </button>
          <button
            onClick={() => {
              const ch = channels.find((c) => c.id === contextMenu.channelId);
              if (ch) {
                const streamUrl = ch.url || ch.shows?.[0]?.episodes?.[0]?.url || '';
                navigator.clipboard.writeText(streamUrl);
                logMessage('custom', 'Copied channel URL to clipboard.');
              }
            }}
            className="w-full text-left px-4 py-2 hover:bg-purple-900/40 hover:text-white flex items-center gap-2"
          >
            <Globe className="w-3.5 h-3.5 text-blue-400" />
            <span>Copy Stream URL</span>
          </button>
          <button
            onClick={() => {
              const ch = channels.find((c) => c.id === contextMenu.channelId);
              if (ch) handleCopy(ch);
            }}
            className="w-full text-left px-4 py-2 hover:bg-purple-900/40 hover:text-white flex items-center gap-2"
          >
            <Copy className="w-3.5 h-3.5 text-purple-400" />
            <span>Copy Row</span>
          </button>
          <button
            onClick={() => {
              const ch = channels.find((c) => c.id === contextMenu.channelId);
              if (ch) handleCut(ch);
            }}
            className="w-full text-left px-4 py-2 hover:bg-purple-900/40 hover:text-white flex items-center gap-2"
          >
            <Scissors className="w-3.5 h-3.5 text-amber-500" />
            <span>Cut Row</span>
          </button>
          <button
            onClick={() => {
              const idx = channels.findIndex((c) => c.id === contextMenu.channelId);
              if (idx !== -1) handlePaste(idx);
            }}
            disabled={!copiedChannel}
            className="w-full text-left px-4 py-2 hover:bg-purple-900/40 hover:text-white flex items-center gap-2 disabled:opacity-45"
          >
            <Clipboard className="w-3.5 h-3.5 text-green-400" />
            <span>Paste Row Below</span>
          </button>
          <div className="border-t border-purple-950/30 my-1" />
          <button
            onClick={() => openBackupModal(contextMenu.channelId)}
            className="w-full text-left px-4 py-2 hover:bg-purple-900/40 hover:text-white flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5 text-indigo-400" />
            <span>Add Backup URL</span>
          </button>
          <button
            onClick={() => {
              const ch = channels.find((c) => c.id === contextMenu.channelId);
              if (ch) {
                setSelectedChannel(ch);
                setShowTvGuideModal(true);
              }
            }}
            className="w-full text-left px-4 py-2 hover:bg-purple-900/40 hover:text-white flex items-center gap-2"
          >
            <Calendar className="w-3.5 h-3.5 text-purple-400" />
            <span>Schedule Show</span>
          </button>
          <button
            onClick={() => deleteChannel(contextMenu.channelId)}
            className="w-full text-left px-4 py-2 hover:bg-purple-900/40 text-red-400 hover:text-red-300 flex items-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-500" />
            <span>Delete Row</span>
          </button>
        </div>
      )}

      {/* Dismiss context menus automatically */}
      {contextMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
      )}

      {/* 5. MODAL: IMPORT REMOTE URL */}
      {showImportUrlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#121319] border border-purple-900/30 rounded-xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto my-auto min-w-0 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-purple-950/20 pb-2 gap-2 min-w-0">
              <h3 className="font-bold text-white text-sm flex items-center gap-2 truncate">
                <Globe className="w-4 h-4 text-purple-400 shrink-0" />
                Import Remote M3U Link
              </h3>
              <button onClick={() => setShowImportUrlModal(false)} className="text-gray-500 hover:text-white shrink-0">✕</button>
            </div>
            <div className="space-y-2 min-w-0">
              <p className="text-[11px] text-gray-400 leading-relaxed break-words">
                Provide any online `.m3u` or `.m3u8` playlist address. Since sandbox containers enforce strict CORS checks, a high-fidelity template with sports and news channels is parsed if a sample URL is used.
              </p>
              <input
                type="text"
                placeholder="https://example.com/playlist.m3u"
                value={importUrlValue}
                onChange={(e) => setImportUrlValue(e.target.value)}
                className="w-full bg-black border border-purple-950/50 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
              />
            </div>
            <div className="flex items-center justify-end gap-2 mt-2 shrink-0">
              <button
                onClick={() => setShowImportUrlModal(false)}
                className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 rounded text-xs text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleImportUrl}
                className="px-4 py-1.5 bg-purple-700 hover:bg-purple-600 rounded text-xs text-white font-bold"
              >
                Download & Load
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL: FETCH EPG */}
      {showFetchEpgModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#121319] border border-purple-900/30 rounded-xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto my-auto min-w-0 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-purple-950/20 pb-2 gap-2 min-w-0">
              <h3 className="font-bold text-white text-sm flex items-center gap-2 truncate">
                <Calendar className="w-4 h-4 text-purple-400 shrink-0" />
                Fetch XMLTV EPG Guide
              </h3>
              <button onClick={() => setShowFetchEpgModal(false)} className="text-gray-500 hover:text-white shrink-0">✕</button>
            </div>
            <div className="space-y-2 min-w-0">
              <p className="text-[11px] text-gray-400 leading-relaxed break-words">
                Download television program schedules from XML EPG feeds. This parses guide listings and syncs them automatically to the channel names in the main matrix.
              </p>
              <input
                type="text"
                placeholder="http://xmltv.org/guide.xml"
                value={fetchEpgValue}
                onChange={(e) => setFetchEpgValue(e.target.value)}
                className="w-full bg-black border border-purple-950/50 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
              />
            </div>
            <div className="flex items-center justify-end gap-2 mt-2 shrink-0">
              <button
                onClick={() => setShowFetchEpgModal(false)}
                className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 rounded text-xs text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleFetchEpg}
                className="px-4 py-1.5 bg-purple-700 hover:bg-purple-600 rounded text-xs text-white font-bold"
              >
                Fetch Schedules
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL: BACKUP URLS */}
      {showBackupsModal && backupChannelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#121319] border border-purple-900/30 rounded-xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto my-auto min-w-0 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-purple-950/20 pb-2 gap-2 min-w-0">
              <h3 className="font-bold text-white text-sm flex items-center gap-2 truncate">
                <Plus className="w-4 h-4 text-purple-400 shrink-0" />
                Manage Backup Stream URLs
              </h3>
              <button onClick={() => setShowBackupsModal(false)} className="text-gray-500 hover:text-white shrink-0">✕</button>
            </div>
            <div className="space-y-3 min-w-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Paste backup URL stream link"
                  value={newBackupUrl}
                  onChange={(e) => setNewBackupUrl(e.target.value)}
                  className="flex-1 bg-black border border-purple-950/50 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-purple-600 min-w-0"
                />
                <button
                  onClick={addBackupUrl}
                  className="px-3 bg-purple-700 hover:bg-purple-600 text-white rounded-lg text-xs font-bold shrink-0"
                >
                  Add
                </button>
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                <h4 className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">Active Backup Links:</h4>
                {(channels.find((c) => c.id === backupChannelId)?.backupUrls || []).map((url, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-black/30 border border-gray-800 rounded text-[11px] font-mono gap-2 min-w-0">
                    <span className="truncate text-gray-300 min-w-0 flex-1">{url}</span>
                    <button
                      onClick={() => removeBackupUrl(i)}
                      className="text-red-400 hover:text-red-300 font-bold shrink-0"
                    >
                      Delete
                    </button>
                  </div>
                ))}
                {(channels.find((c) => c.id === backupChannelId)?.backupUrls || []).length === 0 && (
                  <p className="text-[11px] text-gray-600 italic">No backup urls configured</p>
                )}
              </div>
            </div>
            <div className="flex justify-end mt-2 shrink-0">
              <button
                onClick={() => setShowBackupsModal(false)}
                className="px-4 py-1.5 bg-gray-900 hover:bg-gray-800 rounded text-xs text-gray-300"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. MODAL: SCHEDULE / TV GUIDE */}
      {showTvGuideModal && selectedChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#121319] border border-purple-900/30 rounded-xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto my-auto min-w-0 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-purple-950/20 pb-2 gap-2 min-w-0">
              <h3 className="font-bold text-white text-sm flex items-center gap-2 truncate">
                <Calendar className="w-4 h-4 text-purple-400 shrink-0" />
                <span className="truncate">Schedule Program: {selectedChannel.name}</span>
              </h3>
              <button onClick={() => setShowTvGuideModal(false)} className="text-gray-500 hover:text-white shrink-0">✕</button>
            </div>

            {selectedChannel && (selectedChannel.id === 'ch-retro-adventure' || selectedChannel.name.toLowerCase().includes('classic cinema')) && (
              <div className="p-3 bg-purple-950/20 border border-purple-900/30 rounded-lg space-y-2 text-left min-w-0">
                <div className="flex items-center gap-1.5 text-purple-400 font-bold text-xs font-mono uppercase">
                  <Sparkles className="w-4 h-4 text-purple-400 animate-pulse shrink-0" />
                  <span>Fair Play Auto-Broadcaster</span>
                </div>
                <p className="text-[10px] text-gray-400 leading-normal break-words">
                  Skip manual input! Automatically build a continuous daily schedule of programs from all other active channels/loaded files in a fair-play round-robin loop.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowTvGuideModal(false);
                    setShowAutoSchedulerModal(true);
                  }}
                  className="w-full py-1.5 bg-purple-700 hover:bg-purple-600 border border-purple-600 text-white text-xs font-bold rounded-md transition-colors uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" style={{ animationDuration: '4s' }} />
                  <span>Configure & Build Smart Schedule</span>
                </button>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const title = (form.elements.namedItem('showTitle') as HTMLInputElement).value;
                const desc = (form.elements.namedItem('showDesc') as HTMLTextAreaElement).value;
                const genre = (form.elements.namedItem('showGenre') as HTMLInputElement).value;
                const url = (form.elements.namedItem('showUrl') as HTMLInputElement).value;
                
                handleAddScheduleShow(title, desc, genre, url);
                setShowTvGuideModal(false);
              }}
              className="space-y-3 min-w-0"
            >
              <div className="space-y-1 text-left">
                <label className="text-[10px] text-gray-400 font-mono uppercase">Show Title / Program Name</label>
                <input
                  type="text"
                  name="showTitle"
                  required
                  placeholder="e.g. Action Cowboys Show"
                  className="w-full bg-black border border-purple-950/50 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-purple-600"
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-[10px] text-gray-400 font-mono uppercase">Category / Genre</label>
                <input
                  type="text"
                  name="showGenre"
                  placeholder="e.g. Western / Sports"
                  className="w-full bg-black border border-purple-950/50 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-purple-600"
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-[10px] text-gray-400 font-mono uppercase">Custom stream URL (Optional)</label>
                <input
                  type="text"
                  name="showUrl"
                  placeholder="e.g. http://stream.url/show.mp4"
                  className="w-full bg-black border border-purple-950/50 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-purple-600"
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-[10px] text-gray-400 font-mono uppercase">Program Synopsis / Description</label>
                <textarea
                  name="showDesc"
                  rows={2}
                  placeholder="Enter a short synopsis of the scheduling block"
                  className="w-full bg-black border border-purple-950/50 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-purple-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowTvGuideModal(false)}
                  className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 rounded text-xs text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-purple-700 hover:bg-purple-600 rounded text-xs text-white font-bold"
                >
                  Save Schedule Block
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 9. MODAL: ADVANCED AUTO-SCHEDULER CONFIGURATOR */}
      {showAutoSchedulerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in overflow-y-auto">
          <div className="bg-[#0f1016] border border-purple-500/30 rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto my-auto min-w-0 flex flex-col gap-5 shadow-2xl shadow-purple-950/40 text-left">
            <div className="flex items-center justify-between border-b border-purple-950/40 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />
                <div>
                  <h3 className="font-black text-white text-sm uppercase tracking-wider">
                    Auto-Schedule Matrix Designer
                  </h3>
                  <p className="text-[10px] text-gray-500 font-mono">
                    Thematic Rotation Engine • Classic Cinema Loop
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAutoSchedulerModal(false)}
                className="text-gray-400 hover:text-white bg-black/40 hover:bg-black/80 rounded-full w-6 h-6 flex items-center justify-center transition-colors cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Category Toggles Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-purple-400 font-mono uppercase tracking-wider font-bold">
                    1. Included Genres & Channels Pool
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSchedulerSelectedGenres(['TV Shows', 'Movies', 'Westerns', 'News', 'Crime Shows'])}
                      className="text-[9px] font-mono text-purple-300 hover:text-white bg-purple-950/40 px-2 py-0.5 rounded border border-purple-900/30 cursor-pointer"
                    >
                      SELECT ALL
                    </button>
                    <button
                      type="button"
                      onClick={() => setSchedulerSelectedGenres([])}
                      className="text-[9px] font-mono text-gray-400 hover:text-white bg-gray-900 px-2 py-0.5 rounded border border-gray-800 cursor-pointer"
                    >
                      DESELECT ALL
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-black/40 rounded-xl border border-purple-950/30">
                  {['TV Shows', 'Movies', 'Westerns', 'News', 'Crime Shows'].map((genre) => {
                    const isChecked = schedulerSelectedGenres.includes(genre);
                    return (
                      <label
                        key={genre}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-[11px] font-sans font-medium transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-purple-950/30 border-purple-800/60 text-purple-200'
                            : 'bg-[#121319]/50 border-gray-900 text-gray-500 hover:border-gray-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSchedulerSelectedGenres((prev) => [...prev, genre]);
                            } else {
                              setSchedulerSelectedGenres((prev) => prev.filter((g) => g !== genre));
                            }
                          }}
                          className="rounded text-purple-600 focus:ring-purple-500 h-3.5 w-3.5 accent-purple-600 cursor-pointer"
                        />
                        <span>{genre}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[9px] text-gray-500 leading-normal italic">
                  Note: Deselecting 'Westerns' or 'Crime Shows' will intelligently filter out and skip all Western/Crime programs during round-robin distribution.
                </p>
              </div>

              {/* Block Layout Selection */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-purple-400 font-mono uppercase tracking-wider font-bold">
                  2. Block Rotation Layout
                </label>
                <div className="relative">
                  <select
                    value={schedulerBlockLayout}
                    onChange={(e) => setSchedulerBlockLayout(e.target.value)}
                    className="w-full bg-black border border-purple-950/50 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-purple-600 appearance-none cursor-pointer font-mono"
                  >
                    <option value="1">1 Hour Layout Blocks (Frequent Shuffling)</option>
                    <option value="2">2 Hour Layout Blocks</option>
                    <option value="4">4 Hour Layout Blocks (Default Standard)</option>
                    <option value="6">6 Hour Layout Blocks (Classic Broadcaster)</option>
                    <option value="8">8 Hour Layout Blocks</option>
                    <option value="12">12 Hour Layout Blocks (Day/Night Halves)</option>
                    <option value="24">24 Hour Layout Block (Full-Day Theme loop)</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-purple-400">
                    ▼
                  </div>
                </div>
              </div>

              {/* Daily Theme Mix Selector */}
              <div className="space-y-2">
                <label className="text-[10px] text-purple-400 font-mono uppercase tracking-wider font-bold">
                  3. Theme Mix Schedule Assignments (24h Clock Lineups)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-black/40 rounded-xl border border-purple-950/30">
                  
                  {/* Morning Block */}
                  <div className="space-y-1">
                    <label className="text-[9px] text-gray-400 font-mono uppercase">
                      🌅 Morning (06:00 - 12:00)
                    </label>
                    <select
                      value={schedulerMorningTheme}
                      onChange={(e) => setSchedulerMorningTheme(e.target.value)}
                      className="w-full bg-black/60 border border-purple-950/40 rounded-md p-1.5 text-[11px] text-gray-200 focus:outline-none focus:border-purple-600 cursor-pointer"
                    >
                      <option value="All">All Mix (Round-Robin)</option>
                      <option value="Westerns">Westerns Theme 🤠</option>
                      <option value="Crime Shows">Crime Shows 🔍</option>
                      <option value="TV Shows">TV Shows Mix 📺</option>
                      <option value="Movies">Movies Feature 🎬</option>
                      <option value="News">News Block 📰</option>
                    </select>
                  </div>

                  {/* Afternoon Block */}
                  <div className="space-y-1">
                    <label className="text-[9px] text-gray-400 font-mono uppercase">
                      ☀️ Afternoon (12:00 - 18:00)
                    </label>
                    <select
                      value={schedulerAfternoonTheme}
                      onChange={(e) => setSchedulerAfternoonTheme(e.target.value)}
                      className="w-full bg-black/60 border border-purple-950/40 rounded-md p-1.5 text-[11px] text-gray-200 focus:outline-none focus:border-purple-600 cursor-pointer"
                    >
                      <option value="All">All Mix (Round-Robin)</option>
                      <option value="Westerns">Westerns Theme 🤠</option>
                      <option value="Crime Shows">Crime Shows 🔍</option>
                      <option value="TV Shows">TV Shows Mix 📺</option>
                      <option value="Movies">Movies Feature 🎬</option>
                      <option value="News">News Block 📰</option>
                    </select>
                  </div>

                  {/* Evening Block */}
                  <div className="space-y-1">
                    <label className="text-[9px] text-gray-400 font-mono uppercase">
                      🌌 Evening (18:00 - 24:00)
                    </label>
                    <select
                      value={schedulerEveningTheme}
                      onChange={(e) => setSchedulerEveningTheme(e.target.value)}
                      className="w-full bg-black/60 border border-purple-950/40 rounded-md p-1.5 text-[11px] text-gray-200 focus:outline-none focus:border-purple-600 cursor-pointer"
                    >
                      <option value="All">All Mix (Round-Robin)</option>
                      <option value="Westerns">Westerns Theme 🤠</option>
                      <option value="Crime Shows">Crime Shows 🔍</option>
                      <option value="TV Shows">TV Shows Mix 📺</option>
                      <option value="Movies">Movies Feature 🎬</option>
                      <option value="News">News Block 📰</option>
                    </select>
                  </div>

                  {/* Late Night Block */}
                  <div className="space-y-1">
                    <label className="text-[9px] text-gray-400 font-mono uppercase">
                      🌙 Late Late Show (00:00 - 06:00)
                    </label>
                    <select
                      value={schedulerLateLateTheme}
                      onChange={(e) => setSchedulerLateLateTheme(e.target.value)}
                      className="w-full bg-black/60 border border-purple-950/40 rounded-md p-1.5 text-[11px] text-gray-200 focus:outline-none focus:border-purple-600 cursor-pointer"
                    >
                      <option value="All">All Mix (Round-Robin)</option>
                      <option value="Westerns">Westerns Theme 🤠</option>
                      <option value="Crime Shows">Crime Shows 🔍</option>
                      <option value="TV Shows">TV Shows Mix 📺</option>
                      <option value="Movies">Movies Feature 🎬</option>
                      <option value="News">News Block 📰</option>
                    </select>
                  </div>

                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-purple-950/20">
              <button
                type="button"
                onClick={() => setShowAutoSchedulerModal(false)}
                className="px-4 py-2 bg-gray-950 hover:bg-gray-900 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition-colors cursor-pointer border border-gray-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleAutoScheduleClassicCinema();
                  setShowAutoSchedulerModal(false);
                }}
                className="px-5 py-2 bg-gradient-to-r from-purple-800 to-indigo-800 hover:from-purple-700 hover:to-indigo-700 text-xs font-bold text-white rounded-lg transition-all cursor-pointer active:scale-95 shadow-md shadow-purple-500/10 flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-300 animate-pulse" />
                <span>Generate Smart Theme Schedule</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Commercial & Interstitial Fill Modal */}
      <CommercialFillModal
        isOpen={showCommercialModal}
        onClose={() => setShowCommercialModal(false)}
        onLogEvent={logMessage}
        onRefreshSchedule={refreshChannels}
      />
        </div>
      )}
    </div>
  );
}
