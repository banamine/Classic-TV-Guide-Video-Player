import fs from 'fs';
import path from 'path';
import { Channel } from '../types';
import { flattenChannelPlaylist } from '../utils/scheduler';

export interface PlaybackTimelineItem {
  url: string;
  title: string;
  durationMs: number;
  startEpochMs: number; // Absolute UTC timestamp when this asset "airs"
  channelId?: string;
  channelName?: string;
  showTitle?: string;
  isCommercialFill?: boolean;
}

/**
 * Generates an absolute 24-hour linear schedule manifest starting at the 03:00 AM reset epoch.
 * Hardcodes absolute Unix timestamps (startEpochMs) sequentially for seamless wall-clock sync.
 */
export function generateDailyScheduleManifest(
  channels: Channel[],
  dateString?: string
): Record<string, PlaybackTimelineItem[]> {
  const targetDateStr = dateString || new Date().toISOString().split('T')[0];
  const [year, month, day] = targetDateStr.split('-').map(Number);

  // 03:00 AM UTC reset epoch anchor
  const resetEpoch = new Date(Date.UTC(year, month - 1, day, 3, 0, 0, 0)).getTime();
  const target24hEnd = resetEpoch + 24 * 60 * 60 * 1000;

  const channelSchedules: Record<string, PlaybackTimelineItem[]> = {};

  channels.forEach((channel) => {
    try {
      const flatItems = flattenChannelPlaylist(channel, { enableInterstitials: true, targetGridMins: 30 });
      if (!flatItems || flatItems.length === 0) return;

      const timeline: PlaybackTimelineItem[] = [];
      let currentEpoch = resetEpoch;

      let idx = 0;
      while (currentEpoch < target24hEnd) {
        const item = flatItems[idx % flatItems.length];
        const duration = item.durationMs || 1800000;

        timeline.push({
          url: item.episode.url,
          title: item.episode.title,
          durationMs: duration,
          startEpochMs: currentEpoch,
          channelId: channel.id,
          channelName: channel.name,
          showTitle: item.show.title,
          isCommercialFill: item.isCommercialFill || false,
        });

        currentEpoch += duration;
        idx++;
      }

      channelSchedules[channel.id] = timeline;
    } catch (err: any) {
      console.warn(`[Manifest Generator] Could not generate manifest for channel ${channel.name}: ${err.message}`);
    }
  });

  return channelSchedules;
}

/**
 * Writes pre-compiled static JSON schedule manifests to disk for public serving.
 */
export function writeDailyScheduleFiles(
  channels: Channel[],
  outputBaseDir: string = process.cwd(),
  dateString?: string
): string[] {
  const targetDateStr = dateString || new Date().toISOString().split('T')[0];
  const manifests = generateDailyScheduleManifest(channels, targetDateStr);

  const savedPaths: string[] = [];

  const publicSchedulesDir = path.join(outputBaseDir, 'public', 'schedules');
  const distSchedulesDir = path.join(outputBaseDir, 'dist', 'schedules');

  [publicSchedulesDir, distSchedulesDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // Flatten primary schedule for default single-feed player
  const primaryChannelId = channels[0]?.id || Object.keys(manifests)[0];
  const primaryTimeline = manifests[primaryChannelId] || [];

  const dateFileName = `schedule-${targetDateStr}.json`;
  const todayFileName = `schedule-today.json`;
  const fullChannelsFileName = `schedules-all-${targetDateStr}.json`;

  [publicSchedulesDir, distSchedulesDir].forEach((dir) => {
    // Write single channel date-stamped file
    const p1 = path.join(dir, dateFileName);
    fs.writeFileSync(p1, JSON.stringify(primaryTimeline, null, 2), 'utf8');
    savedPaths.push(p1);

    // Write schedule-today.json
    const p2 = path.join(dir, todayFileName);
    fs.writeFileSync(p2, JSON.stringify(primaryTimeline, null, 2), 'utf8');
    savedPaths.push(p2);

    // Write multi-channel schedule file
    const p3 = path.join(dir, fullChannelsFileName);
    fs.writeFileSync(p3, JSON.stringify(manifests, null, 2), 'utf8');
    savedPaths.push(p3);
  });

  return savedPaths;
}
