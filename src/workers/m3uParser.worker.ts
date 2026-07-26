/**
 * Web Worker for offloading heavy M3U string parsing, regex matching,
 * and EPG schedule block generation from the React main thread.
 */

self.onmessage = (event: MessageEvent<{ rawM3uText: string; filename?: string }>) => {
  const { rawM3uText, filename = 'imported.m3u' } = event.data;

  try {
    const lines = rawM3uText.split(/\r?\n/);
    let isMasterPlaylist = false;

    for (let i = 0; i < Math.min(lines.length, 500); i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXTINF:')) {
        const durationPart = (line.substring(8) || '').split(',')[0].trim();
        const dur = parseInt(durationPart, 10);
        if (dur > 10) {
          isMasterPlaylist = true;
          break;
        }
      }
    }

    const items: Array<{ title: string; url: string; duration: number; groupTitle: string }> = [];
    let currentMeta: { duration: number; title: string; groupTitle: string } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('#EXTINF:')) {
        const extinfContent = line.substring(8);
        const commaIndex = extinfContent.lastIndexOf(',');
        let title = 'Unnamed Segment';
        if (commaIndex !== -1) {
          title = extinfContent.substring(commaIndex + 1).trim();
        }

        const durationMatch = extinfContent.match(/^([-\d]+)/);
        const duration = durationMatch ? parseInt(durationMatch[1], 10) : 300;

        let groupTitle = 'General';
        const groupMatch = extinfContent.match(/group-title="([^"]*)"/i);
        if (groupMatch) {
          groupTitle = groupMatch[1];
        }

        currentMeta = { duration: duration > 0 ? duration : 300, title, groupTitle };
      } else if (!line.startsWith('#') && currentMeta) {
        if (line.startsWith('http://') || line.startsWith('https://')) {
          items.push({
            title: currentMeta.title,
            url: line,
            duration: currentMeta.duration,
            groupTitle: currentMeta.groupTitle
          });
        }
        currentMeta = null;
      }
    }

    self.postMessage({
      success: true,
      isMasterPlaylist,
      itemCount: items.length,
      items
    });
  } catch (err: any) {
    self.postMessage({
      success: false,
      error: err?.message || 'Failed to parse M3U in Web Worker'
    });
  }
};
