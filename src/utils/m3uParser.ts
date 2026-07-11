/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Channel, Show, Episode } from '../types';

/**
 * Parses an M3U/M3U8 playlist string into structured Channel objects.
 */
export function parseM3U(text: string, filename: string = 'imported.m3u'): Channel[] {
  const lines = text.split(/\r?\n/);
  const channels: Channel[] = [];
  
  let currentExtinf: {
    duration: string;
    properties: Record<string, string>;
    name: string;
    customTags: Record<string, string>;
  } | null = null;
  
  let channelCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTM3U')) {
      // Header line, can contain global attributes
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      // Parse EXTINF line
      // Format: #EXTINF:<duration> <attributes>,<channel name>
      const extinfContent = line.substring(8);
      const commaIndex = extinfContent.lastIndexOf(',');
      
      let attributesPart = '';
      let channelName = 'Unnamed Channel';

      if (commaIndex !== -1) {
        attributesPart = extinfContent.substring(0, commaIndex);
        channelName = extinfContent.substring(commaIndex + 1).trim();
      } else {
        attributesPart = extinfContent;
      }

      // Extract duration (the first token before space)
      const durationMatch = attributesPart.match(/^([-\d]+)/);
      const duration = durationMatch ? durationMatch[1] : '-1';
      
      // Parse key="value" attributes
      const properties: Record<string, string> = {};
      const attributeRegex = /(\w+[-_]?\w*)="([^"]*)"/g;
      let match;
      while ((match = attributeRegex.exec(attributesPart)) !== null) {
        properties[match[1]] = match[2];
      }

      currentExtinf = {
        duration,
        properties,
        name: channelName,
        customTags: {}
      };
      continue;
    }

    if (line.startsWith('#EXTGRP:')) {
      // Category group tag
      if (currentExtinf) {
        currentExtinf.properties['group-title'] = line.substring(8).trim();
      }
      continue;
    }

    if (line.startsWith('#')) {
      // Custom / non-standard M3U tags
      if (currentExtinf) {
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1) {
          const key = line.substring(1, colonIndex).trim();
          const val = line.substring(colonIndex + 1).trim();
          currentExtinf.customTags[key] = val;
        } else {
          currentExtinf.customTags[line.substring(1)] = 'true';
        }
      }
      continue;
    }

    // It is a stream URL
    if (line.startsWith('http://') || line.startsWith('https://') || line.startsWith('rtmp://') || line.startsWith('rtsp://')) {
      const name = currentExtinf ? currentExtinf.name : `Channel ${channelCounter}`;
      const group = currentExtinf?.properties['group-title'] || currentExtinf?.properties['tvg-group'] || 'Uncategorized';
      const logoText = name.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const logoUrl = currentExtinf?.properties['tvg-logo'] || '';

      // Generate a mock show and episodes list for EPG support
      const mockEpisodes: Episode[] = [
        {
          id: `ep-${Math.random().toString(36).substr(2, 9)}`,
          title: `Stream Broadcast Loop`,
          season: '1',
          episodeNumber: '1',
          url: line
        }
      ];

      const mockShows: Show[] = [
        {
          id: `show-${Math.random().toString(36).substr(2, 9)}`,
          title: `${name} Live Feed`,
          description: `Direct interactive IPTV stream from ${filename}.`,
          year: new Date().getFullYear().toString(),
          genre: group || 'General',
          episodes: mockEpisodes
        }
      ];

      const colorPalette = ['#d97706', '#9333ea', '#16a34a', '#2563eb', '#db2777', '#06b6d4', '#f43f5e'];
      const accentColor = colorPalette[Math.floor(Math.random() * colorPalette.length)];

      channels.push({
        id: `ch-import-${Math.random().toString(36).substr(2, 9)}`,
        number: String(100 + channelCounter),
        name,
        tagline: currentExtinf?.properties['tvg-id'] 
          ? `EPG ID: ${currentExtinf.properties['tvg-id']}` 
          : `High quality stream looping from ${filename}`,
        category: group,
        logoText: logoText || 'IPTV',
        accentColor,
        shows: mockShows,
        url: line,
        backupUrls: [],
        customTags: currentExtinf?.customTags || {},
        status: 'unchecked',
        logoUrl
      });

      channelCounter++;
      currentExtinf = null;
    }
  }

  return channels;
}

/**
 * Generates an M3U file string from a list of Channel objects.
 */
export function exportM3U(channels: Channel[]): string {
  let m3u = '#EXTM3U\n';
  
  channels.forEach((ch) => {
    const tvgLogo = ch.logoUrl ? ` tvg-logo="${ch.logoUrl}"` : '';
    const groupTitle = ch.category ? ` group-title="${ch.category}"` : '';
    const tvgName = ` tvg-name="${ch.name}"`;
    const tvgId = ch.tagline.startsWith('EPG ID: ') ? ` tvg-id="${ch.tagline.replace('EPG ID: ', '')}"` : ` tvg-id="${ch.id}"`;

    m3u += `#EXTINF:-1${tvgId}${tvgName}${tvgLogo}${groupTitle},${ch.name}\n`;
    
    // Add custom tags if any
    if (ch.customTags) {
      Object.entries(ch.customTags).forEach(([key, val]) => {
        m3u += `#${key}:${val}\n`;
      });
    }

    // Prefer stream-level url or fall back to first episode url
    const streamUrl = ch.url || ch.shows?.[0]?.episodes?.[0]?.url || '';
    m3u += `${streamUrl}\n`;
  });

  return m3u;
}

/**
 * Generates a CSV string from a list of Channel objects.
 */
export function exportCSV(channels: Channel[]): string {
  let csv = 'Number,Name,Group,Stream URL,Backup URLs Count,Custom Tags Count,Status\n';
  
  channels.forEach((ch) => {
    const streamUrl = ch.url || ch.shows?.[0]?.episodes?.[0]?.url || '';
    const backsCount = ch.backupUrls?.length || 0;
    const tagsCount = ch.customTags ? Object.keys(ch.customTags).length : 0;
    const status = ch.status || 'unchecked';

    // Escape commas and quotes for CSV compatibility
    const cleanName = ch.name.replace(/"/g, '""');
    const cleanGroup = ch.category.replace(/"/g, '""');

    csv += `"${ch.number}","${cleanName}","${cleanGroup}","${streamUrl}",${backsCount},${tagsCount},"${status}"\n`;
  });

  return csv;
}
