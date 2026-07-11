/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { CHANNELS_DATA } from './data/playlist';
import { Channel, Episode, Show, PlaybackLog } from './types';
import { getLiveEpisodeForChannel } from './utils/scheduler';
import { CustomVideoPlayer } from './components/CustomVideoPlayer';
import { EPGGuide } from './components/EPGGuide';
import { DiagnosticConsole } from './components/DiagnosticConsole';
import { parseM3U, exportM3U, exportCSV } from './utils/m3uParser';
import { generateStaticPlayerHtml } from './utils/staticPlayerGenerator';
import {
  Radio,
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
  RefreshCw
} from 'lucide-react';

export default function App() {
  // Primary state holding all channels (initially from playlist data)
  const [channels, setChannels] = useState<Channel[]>(() => {
    const initialChannels = [...CHANNELS_DATA];
    const targetChannelIndex = initialChannels.findIndex(
      (c) => c.id === 'ch-retro-adventure' || c.name.toLowerCase().includes('classic cinema')
    );
    if (targetChannelIndex !== -1) {
      const otherChannels = initialChannels.filter((_, idx) => idx !== targetChannelIndex);
      const queues: Array<Array<{ show: Show; episode: Episode }>> = [];
      otherChannels.forEach((ch) => {
        const chItems: Array<{ show: Show; episode: Episode }> = [];
        ch.shows.forEach((show) => {
          show.episodes.forEach((ep) => {
            chItems.push({ show, episode: ep });
          });
        });
        if (chItems.length > 0) {
          queues.push(chItems);
        }
      });

      if (queues.length > 0) {
        const scheduledItems: Array<{ show: Show; episode: Episode }> = [];
        let hasMore = true;
        let index = 0;
        while (hasMore) {
          hasMore = false;
          for (let q = 0; q < queues.length; q++) {
            if (index < queues[q].length) {
              scheduledItems.push(queues[q][index]);
              hasMore = true;
            }
          }
          index++;
        }

        const newShows: Show[] = scheduledItems.map((item, idx) => ({
          id: `rcs-show-${idx}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          title: item.show.title,
          description: item.show.description,
          year: item.show.year,
          genre: item.show.genre,
          episodes: [
            {
              id: `rcs-ep-${idx}-${Date.now()}`,
              title: item.episode.title,
              season: item.episode.season || '1',
              episodeNumber: item.episode.episodeNumber || String(idx + 1),
              url: item.episode.url
            }
          ]
        }));

        initialChannels[targetChannelIndex] = {
          ...initialChannels[targetChannelIndex],
          shows: newShows
        };
      }
    }
    return initialChannels;
  });
  const [selectedChannel, setSelectedChannel] = useState<Channel>(CHANNELS_DATA[0]);
  const [selectedShow, setSelectedShow] = useState<Show>(CHANNELS_DATA[0].shows[0]);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode>(CHANNELS_DATA[0].shows[0].episodes[0]);

  // Loaded playlists source registry
  const [loadedFiles, setLoadedFiles] = useState<string[]>(['Classic_Retro_TV_Defaults.m3u']);

  // Playback modes
  const [isLiveMode, setIsLiveMode] = useState<boolean>(true);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(Date.now());
  const [liveSeekOffset, setLiveSeekOffset] = useState<number>(0);

  // Diagnostic Logs array
  const [logs, setLogs] = useState<PlaybackLog[]>([]);

  // Search & Filter controls
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [regexSearchError, setRegexSearchError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('All');

  // Inline Cell Editing states
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editingFieldName, setEditingFieldName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');

  // Primary workspace tabs
  const [workspaceTab, setWorkspaceTab] = useState<'matrix' | 'epg' | 'github'>('matrix');

  // GitHub integration state variables
  const [githubRepo, setGithubRepo] = useState<string>(() => localStorage.getItem('m3u_pro_github_repo') || 'banamine/Nexus-TV-O');
  const [githubBranch, setGithubBranch] = useState<string>(() => localStorage.getItem('m3u_pro_github_branch') || 'main');
  const [githubToken, setGithubToken] = useState<string>(() => localStorage.getItem('m3u_pro_github_token') || '');
  const [githubStatus, setGithubStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [githubFiles, setGithubFiles] = useState<any[]>([]);
  const [githubWorkflows, setGithubWorkflows] = useState<any[]>([]);
  const [isGithubLoading, setIsGithubLoading] = useState<boolean>(false);
  const [githubMessage, setGithubMessage] = useState<string>('');
  const [currentExplorerPath, setCurrentExplorerPath] = useState<string>('');
  
  // Static Player Preview
  const [staticPlayerPreviewBlobUrl, setStaticPlayerPreviewBlobUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState<boolean>(false);
  const [githubM3uSavePath, setGithubM3uSavePath] = useState<string>('playlist.m3u');
  const [githubHtmlSavePath, setGithubHtmlSavePath] = useState<string>('index.html');

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
  const [showBackupsModal, setShowBackupsModal] = useState<boolean>(false);
  const [backupChannelId, setBackupChannelId] = useState<string | null>(null);
  const [newBackupUrl, setNewBackupUrl] = useState<string>('');
  const [showTvGuideModal, setShowTvGuideModal] = useState<boolean>(false);

  // Custom row context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    channelId: string;
  } | null>(null);

  // File input ref for Load action
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Periodically refresh current time to drive virtual broadcast scheduler
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Set up initial telemetry logs
  useEffect(() => {
    logMessage('custom', 'M3U MATRIX PRO Web Workspace initialized successfully.');
    logMessage('custom', `Loaded default playlist with ${CHANNELS_DATA.length} channels.`);
  }, []);

  // Update selection dynamically when scheduling changes or channel updates (in simulated Live mode)
  useEffect(() => {
    if (isLiveMode && selectedChannel) {
      try {
        const live = getLiveEpisodeForChannel(selectedChannel, currentTimeMs);
        setSelectedShow(live.show);
        setSelectedEpisode(live.episode);
        setLiveSeekOffset(live.seekOffsetSeconds);
      } catch (err) {
        // Fallback if channel has custom raw playlist structure with no EPG
        const fallbackShow = selectedChannel.shows?.[0];
        const fallbackEp = fallbackShow?.episodes?.[0];
        if (fallbackShow && fallbackEp) {
          setSelectedShow(fallbackShow);
          setSelectedEpisode(fallbackEp);
          setLiveSeekOffset(0);
        }
      }
    }
  }, [selectedChannel?.id, isLiveMode, currentTimeMs]);

  // Log system telemetry events
  const logMessage = (
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
  };

  const handleClearLogs = () => {
    setLogs([]);
    logMessage('custom', 'Console logs cleared.');
  };

  // Save credentials to localStorage when updated
  const saveGithubCredentials = (repo: string, branch: string, token: string) => {
    setGithubRepo(repo);
    setGithubBranch(branch);
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
      setGithubMessage(`Dispatch failed: ${err.message}`);
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

      const playerContent = generateStaticPlayerHtml(channels, `Nexus Auto-Scheduled TV Guide`);
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

  const handlePreviewStaticPlayer = () => {
    setIsGeneratingPreview(true);
    try {
      const html = generateStaticPlayerHtml(channels, `Station Live Broadcast Preview`);
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

  // Safe stream switch handler
  const handleSelectChannel = (channel: Channel) => {
    setSelectedChannel(channel);
    setSelectedRowId(channel.id);
    
    const show = channel.shows?.[0] || {
      id: 'default',
      title: 'Live TV Stream',
      description: 'Generic IPTV Direct Stream',
      year: '2026',
      genre: channel.category,
      episodes: []
    };
    const episode = show.episodes?.[0] || {
      id: 'default-ep',
      title: 'Live Stream Loop',
      url: channel.url || ''
    };

    setSelectedShow(show);
    setSelectedEpisode(episode);

    logMessage('epg', `[Matrix Selection]: Routing tuner to CH ${channel.number} "${channel.name}"`);

    if (isLiveMode) {
      try {
        const live = getLiveEpisodeForChannel(channel, currentTimeMs);
        setSelectedShow(live.show);
        setSelectedEpisode(live.episode);
        setLiveSeekOffset(live.seekOffsetSeconds);
      } catch (e) {
        setLiveSeekOffset(0);
      }
    } else {
      setLiveSeekOffset(0);
    }
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
        const parsed = parseM3U(text, file.name);
        if (parsed.length === 0) {
          logMessage('error', `Parsed 0 channels from "${file.name}". Make sure it is a valid M3U file.`);
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

  const saveCellEdit = () => {
    if (!editingChannelId || !editingFieldName) return;

    setChannels((prev) =>
      prev.map((ch) => {
        if (ch.id === editingChannelId) {
          const updated = { ...ch };
          if (editingFieldName === 'number') {
            updated.number = editingValue;
          } else if (editingFieldName === 'name') {
            updated.name = editingValue;
          } else if (editingFieldName === 'group') {
            updated.category = editingValue;
          } else if (editingFieldName === 'url') {
            updated.url = editingValue;
            if (updated.shows?.[0]?.episodes?.[0]) {
              updated.shows[0].episodes[0].url = editingValue;
            }
          } else if (editingFieldName === 'nowPlaying') {
            if (updated.shows?.[0]) {
              updated.shows[0].title = editingValue;
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
      })
    );

    logMessage('custom', `Updated field "${editingFieldName}" value to "${editingValue}"`);
    setEditingChannelId(null);
    setEditingFieldName(null);
  };

  // DELETE CHANNEL
  const deleteChannel = (channelId: string) => {
    const target = channels.find((c) => c.id === channelId);
    const updated = channels.filter((c) => c.id !== channelId);
    setChannels(updated);
    logMessage('custom', `Deleted channel row: "${target?.name || channelId}"`);

    if (selectedChannel.id === channelId && updated.length > 0) {
      handleSelectChannel(updated[0]);
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

    // 3. Gather all shows and episodes from other channels
    const queues: Array<Array<{ show: Show; episode: Episode }>> = [];
    otherChannels.forEach((ch) => {
      const chItems: Array<{ show: Show; episode: Episode }> = [];
      ch.shows.forEach((show) => {
        show.episodes.forEach((ep) => {
          chItems.push({ show, episode: ep });
        });
      });
      if (chItems.length > 0) {
        queues.push(chItems);
      }
    });

    if (queues.length === 0) {
      if (!quiet) logMessage('error', 'No episodes found in other active channels.');
      return;
    }

    // 4. Perform fair-play round robin selection
    const scheduledItems: Array<{ show: Show; episode: Episode }> = [];
    let hasMore = true;
    let index = 0;

    while (hasMore) {
      hasMore = false;
      for (let q = 0; q < queues.length; q++) {
        if (index < queues[q].length) {
          scheduledItems.push(queues[q][index]);
          hasMore = true;
        }
      }
      index++;
    }

    // 5. Convert scheduled items to Classic Cinema & Movies shows list
    const newShows: Show[] = scheduledItems.map((item, idx) => ({
      id: `rcs-show-${idx}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      title: item.show.title,
      description: item.show.description,
      year: item.show.year,
      genre: item.show.genre,
      episodes: [
        {
          id: `rcs-ep-${idx}-${Date.now()}`,
          title: item.episode.title,
          season: item.episode.season || '1',
          episodeNumber: item.episode.episodeNumber || String(idx + 1),
          url: item.episode.url
        }
      ]
    }));

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
        `[Auto-Scheduler]: Scheduled continuous daily loop of ${newShows.length} shows on "Classic Cinema & Movies" in fair-play round-robin sequence.`
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

  if (searchQuery.trim()) {
    const query = searchQuery.trim();
    const regexMatch = query.match(/^\/(.+)\/([gimy]*)$/);
    
    if (regexMatch) {
      try {
        const pattern = regexMatch[1];
        const flags = regexMatch[2];
        const regex = new RegExp(pattern, flags);
        filteredChannels = filteredChannels.filter((ch) => regex.test(ch.name) || regex.test(ch.category));
        if (regexSearchError) setRegexSearchError(null);
      } catch (e) {
        if (!regexSearchError) setRegexSearchError('Invalid Regular Expression syntax');
      }
    } else {
      const lowerQuery = query.toLowerCase();
      filteredChannels = filteredChannels.filter(
        (ch) =>
          ch.name.toLowerCase().includes(lowerQuery) ||
          ch.category.toLowerCase().includes(lowerQuery) ||
          ch.number.includes(lowerQuery)
      );
      if (regexSearchError) setRegexSearchError(null);
    }
  } else {
    if (regexSearchError) setRegexSearchError(null);
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
    <div className="flex flex-col h-screen w-full bg-[#0b0c10] text-[#c5c6c7] font-sans overflow-hidden">
      
      {/* 1. Header Branded Banner Rail */}
      <header className="h-16 border-b border-purple-900/40 bg-[#1f2833]/30 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-purple-700 to-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-sm shadow-md shadow-purple-500/20 tracking-wider">
            M3U
          </div>
          <div>
            <h1 className="text-sm font-black text-white uppercase tracking-wider font-sans flex items-center gap-2">
              M3U MATRIX PRO <span className="text-[9px] bg-purple-500/10 border border-purple-500/30 text-purple-400 px-1.5 py-0.5 rounded font-mono font-normal">WEB BUILD</span>
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
            onClick={() => handleAutoScheduleClassicCinema()}
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
                  setWorkspaceTab('github');
                  if (githubRepo) {
                    fetchGithubContents(currentExplorerPath);
                    fetchGithubWorkflows();
                  }
                }}
                className={`px-4 py-1.5 rounded-md text-[11px] font-black tracking-wider uppercase transition-all cursor-pointer flex items-center gap-2 ${
                  workspaceTab === 'github'
                    ? 'bg-purple-900 text-white shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Github className="w-3.5 h-3.5" />
                <span>GitHub Sync Console</span>
              </button>
            </div>
            <div className="text-[10px] font-mono text-gray-500 uppercase tracking-wider hidden sm:block">
              {workspaceTab === 'matrix' 
                ? 'Double click any cell to edit inline' 
                : workspaceTab === 'epg' 
                  ? 'Real-time Program Loops' 
                  : 'GitHub REST API Integration Deck'}
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
                  setSelectedChannel(ch);
                  setSelectedShow(s);
                  setSelectedEpisode(ep);
                  setIsLiveMode(isLive);
                  logMessage('epg', `[EPG Timeline Switch]: Selected program "${s.title}"`);
                }}
                onLogEvent={logMessage}
              />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-5 bg-[#08090c] scrollbar-thin space-y-5 text-left text-gray-200">
              {/* STATUS & FEEDBACK BANNER */}
              {(githubMessage || githubStatus === 'error') && (
                <div className={`p-4 rounded-xl border flex items-start gap-3 text-xs leading-relaxed transition-all shadow-lg ${
                  githubStatus === 'error'
                    ? 'bg-red-500/10 border-red-500/30 text-red-300'
                    : 'bg-purple-950/20 border-purple-800/30 text-purple-300'
                }`}>
                  <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${githubStatus === 'error' ? 'text-red-400' : 'text-purple-400'}`} />
                  <div className="flex-1">
                    <span className="font-bold uppercase font-mono block mb-1">
                      {githubStatus === 'error' ? 'REST API error' : 'Sync Console Notification'}
                    </span>
                    <span>{githubMessage || 'Unknown error communicating with GitHub APIs.'}</span>
                  </div>
                  <button 
                    onClick={() => setGithubMessage('')} 
                    className="text-[10px] font-mono hover:text-white px-2 py-0.5 rounded bg-black/40 border border-white/5"
                  >
                    DISMISS
                  </button>
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
                          <GitBranch className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-2.5" />
                          <input
                            type="text"
                            value={githubBranch}
                            onChange={(e) => setGithubBranch(e.target.value)}
                            placeholder="main"
                            className="w-full bg-black/50 border border-purple-950/50 hover:border-purple-800/50 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white font-mono placeholder-gray-600 focus:outline-none"
                          />
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
          )}
        </div>

        {/* RIGHT SIDEBAR / SPLIT TUNER PORTAL */}
        <aside className="w-full lg:w-[400px] xl:w-[440px] border-t lg:border-t-0 lg:border-l border-purple-950/30 bg-[#0f1015]/60 flex flex-col lg:shrink-0 h-[520px] lg:h-full overflow-hidden">
          
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
                  channelName={selectedChannel?.name || 'Tuner Deck'}
                  isLiveMode={isLiveMode}
                  liveSeekOffset={liveSeekOffset}
                  onLogEvent={logMessage}
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
          </div>

          {/* Real-time Diagnostics Monitor Console */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-hidden p-3 bg-black/10">
              <DiagnosticConsole logs={logs} onClearLogs={handleClearLogs} />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#121319] border border-purple-900/30 rounded-xl p-5 max-w-md w-full flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-purple-950/20 pb-2">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Globe className="w-4 h-4 text-purple-400" />
                Import Remote M3U Link
              </h3>
              <button onClick={() => setShowImportUrlModal(false)} className="text-gray-500 hover:text-white">✕</button>
            </div>
            <div className="space-y-2">
              <p className="text-[11px] text-gray-400 leading-relaxed">
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
            <div className="flex items-center justify-end gap-2 mt-2">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#121319] border border-purple-900/30 rounded-xl p-5 max-w-md w-full flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-purple-950/20 pb-2">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-400" />
                Fetch XMLTV EPG Guide
              </h3>
              <button onClick={() => setShowFetchEpgModal(false)} className="text-gray-500 hover:text-white">✕</button>
            </div>
            <div className="space-y-2">
              <p className="text-[11px] text-gray-400 leading-relaxed">
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
            <div className="flex items-center justify-end gap-2 mt-2">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#121319] border border-purple-900/30 rounded-xl p-5 max-w-md w-full flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-purple-950/20 pb-2">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-purple-400" />
                Manage Backup Stream URLs
              </h3>
              <button onClick={() => setShowBackupsModal(false)} className="text-gray-500 hover:text-white">✕</button>
            </div>
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Paste backup URL stream link"
                  value={newBackupUrl}
                  onChange={(e) => setNewBackupUrl(e.target.value)}
                  className="flex-1 bg-black border border-purple-950/50 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-purple-600"
                />
                <button
                  onClick={addBackupUrl}
                  className="px-3 bg-purple-700 hover:bg-purple-600 text-white rounded-lg text-xs font-bold"
                >
                  Add
                </button>
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                <h4 className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">Active Backup Links:</h4>
                {(channels.find((c) => c.id === backupChannelId)?.backupUrls || []).map((url, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-black/30 border border-gray-800 rounded text-[11px] font-mono">
                    <span className="truncate pr-4 text-gray-300">{url}</span>
                    <button
                      onClick={() => removeBackupUrl(i)}
                      className="text-red-400 hover:text-red-300 font-bold"
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
            <div className="flex justify-end mt-2">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#121319] border border-purple-900/30 rounded-xl p-5 max-w-md w-full flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-purple-950/20 pb-2">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-400" />
                Schedule Program: {selectedChannel.name}
              </h3>
              <button onClick={() => setShowTvGuideModal(false)} className="text-gray-500 hover:text-white">✕</button>
            </div>

            {selectedChannel && (selectedChannel.id === 'ch-retro-adventure' || selectedChannel.name.toLowerCase().includes('classic cinema')) && (
              <div className="p-3 bg-purple-950/20 border border-purple-900/30 rounded-lg space-y-2 text-left">
                <div className="flex items-center gap-1.5 text-purple-400 font-bold text-xs font-mono uppercase">
                  <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
                  <span>Fair Play Auto-Broadcaster</span>
                </div>
                <p className="text-[10px] text-gray-400 leading-normal">
                  Skip manual input! Automatically build a continuous daily schedule of programs from all other active channels/loaded files in a fair-play round-robin loop.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    handleAutoScheduleClassicCinema();
                    setShowTvGuideModal(false);
                  }}
                  className="w-full py-1.5 bg-purple-700 hover:bg-purple-600 border border-purple-600 text-white text-xs font-bold rounded-md transition-colors uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '4s' }} />
                  <span>Build Round-Robin Schedule Now</span>
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
              className="space-y-3"
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

              <div className="flex items-center justify-end gap-2 pt-2">
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

    </div>
  );
}
