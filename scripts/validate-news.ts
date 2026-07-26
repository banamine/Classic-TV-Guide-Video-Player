import fs from 'fs';
import path from 'path';

export interface ValidationIssue {
  episodeId: string;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export function validateNewsEntries(episodes: any[]): { valid: boolean; errors: ValidationIssue[]; warnings: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const MONTH_MAP: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
  };

  for (const ep of episodes) {
    const isAJN = ep.groupTitle === 'Alex Jones Network' || (ep.id && ep.id.startsWith('ajn_')) || (ep.tvgId && ep.tvgId.startsWith('ajn'));

    // Rule 1: sourceHost / URL-domain check (RT / Standard ONLY, SKIP for AJN)
    if (!isAJN) {
      if (ep.url && ep.sourceHost) {
        try {
          const parsedUrlHost = new URL(ep.url).hostname;
          if (ep.sourceHost !== parsedUrlHost && !parsedUrlHost.includes(ep.sourceHost)) {
            errors.push({
              episodeId: ep.id,
              field: 'sourceHost',
              message: `Source host mismatch for RT/standard entry: sourceHost="${ep.sourceHost}" vs urlHost="${parsedUrlHost}"`,
              severity: 'error'
            });
          }
        } catch (e: any) {
          errors.push({
            episodeId: ep.id,
            field: 'url',
            message: `Invalid URL format: ${ep.url}`,
            severity: 'error'
          });
        }
      }
    }

    // Rule 2: Duration-bound check for AJN / hourly segments
    if (isAJN || /Hour\s*\d+/i.test(ep.title || '')) {
      const dur = ep.duration || 0;
      if (dur > 7200) {
        errors.push({
          episodeId: ep.id,
          field: 'duration',
          message: `Duration outlier detected for hourly segment: ${dur}s (~${(dur / 3600).toFixed(1)}h). Expected range is 3000-4000s (<7200s).`,
          severity: 'error'
        });
      } else if (dur < 3000 && dur > 0) {
        warnings.push({
          episodeId: ep.id,
          field: 'duration',
          message: `Duration below expected hourly range: ${dur}s. Expected range is 3000-4000s.`,
          severity: 'warning'
        });
      }
    }

    // Rule 3: ID / Title date consistency check for AJN
    if (isAJN) {
      const idDateMatch = ep.id ? ep.id.match(/ajn_(\d{8})/i) : null;
      const dateFromId = idDateMatch ? idDateMatch[1] : null;

      let dateFromTitle: string | null = null;
      const titleDateMatch = ep.title ? ep.title.match(/(\d{4})-([A-Za-z]{3})-(\d{2})/) : null;
      if (titleDateMatch) {
        const year = titleDateMatch[1];
        const monthStr = titleDateMatch[2];
        const day = titleDateMatch[3];
        const monthNum = MONTH_MAP[monthStr] || '01';
        dateFromTitle = `${year}${monthNum}${day}`;
      }

      if (dateFromId && dateFromTitle) {
        if (dateFromId !== dateFromTitle) {
          errors.push({
            episodeId: ep.id,
            field: 'id/title',
            message: `AJN ID/title date mismatch! ID embedded date (${dateFromId}) does not equal title date (${dateFromTitle}).`,
            severity: 'error'
          });
        }
      }
    }

    // Rule 4: Subtitle URL check
    if (isAJN && (ep.subtitleUrl === undefined || ep.subtitleUrl === null)) {
      warnings.push({
        episodeId: ep.id,
        field: 'subtitleUrl',
        message: 'AJN entry should have explicit subtitleUrl: "" (empty string representing no captions available).',
        severity: 'warning'
      });
    }

    // Rule 5: Thumbnail check for AJN
    if (isAJN && !ep.thumbnailUrl) {
      errors.push({
        episodeId: ep.id,
        field: 'thumbnailUrl',
        message: 'Missing thumbnailUrl on AJN entry.',
        severity: 'error'
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Asynchronous Batch Link Validation & Health Checking
 * Sends Range: bytes=0-100 GET requests to verify playable stream integrity.
 */
export async function verifyAndPruneStreamUrls(filePath: string): Promise<{ validCount: number; prunedCount: number }> {
  if (!fs.existsSync(filePath)) return { validCount: 0, prunedCount: 0 };

  let data: any;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    data = JSON.parse(content);
  } catch (e) {
    return { validCount: 0, prunedCount: 0 };
  }

  if (!data || !Array.isArray(data.episodes)) return { validCount: 0, prunedCount: 0 };

  const validEpisodes: any[] = [];
  let prunedCount = 0;

  console.log(`🔗 Checking stream URL reachability for ${filePath} (${data.episodes.length} episodes)...`);

  for (const ep of data.episodes) {
    if (!ep.url) {
      prunedCount++;
      continue;
    }

    try {
      const res = await fetch(ep.url, { method: 'GET', headers: { Range: 'bytes=0-100' } });
      if (res.status === 200 || res.status === 206) {
        validEpisodes.push({ ...ep, status: 'validated', validatedAt: new Date().toISOString() });
      } else {
        console.warn(`  ⚠️ Pruning dead URL (${res.status} ${res.statusText}): "${ep.title}" (${ep.url})`);
        prunedCount++;
      }
    } catch (err: any) {
      console.warn(`  ⚠️ Pruning unreachable URL (${err.message}): "${ep.title}" (${ep.url})`);
      prunedCount++;
    }
  }

  // Update JSON payload with valid episodes
  data.episodes = validEpisodes;
  data.total = validEpisodes.length;

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`📊 [Stream Link Audit]: Total Valid: ${validEpisodes.length} | Pruned: ${prunedCount} for ${filePath}`);

  return { validCount: validEpisodes.length, prunedCount };
}

export async function runValidationCli() {
  console.log('🔍 [News Validation Script] Running rules & stream reachability audit...');

  const targetFiles = [
    path.join(process.cwd(), 'news.json'),
    path.join(process.cwd(), 'fresh_news.json'),
    path.join(process.cwd(), 'public', 'news.json'),
    path.join(process.cwd(), 'public', 'fresh_news.json')
  ];

  let totalValid = 0;
  let totalPruned = 0;

  for (const file of targetFiles) {
    if (fs.existsSync(file)) {
      const stats = await verifyAndPruneStreamUrls(file);
      totalValid += stats.validCount;
      totalPruned += stats.prunedCount;

      try {
        const raw = fs.readFileSync(file, 'utf8');
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.episodes)) {
          const { valid, errors, warnings } = validateNewsEntries(data.episodes);
          if (warnings.length > 0) {
            console.log(`  ⚠️ Schema Warnings for ${file} (${warnings.length})`);
          }
          if (errors.length > 0) {
            console.error(`  ❌ Schema ERRORS for ${file} (${errors.length})`);
          }
        }
      } catch (e) {}
    }
  }

  console.log(`\n🎉 News Link Validation & Health Audit Complete!`);
  console.log(`   Total Valid Streams Active: ${totalValid}`);
  console.log(`   Total Dead Streams Pruned: ${totalPruned}`);
}

if (process.argv[1] && (process.argv[1].endsWith('validate-news.ts') || process.argv[1].endsWith('validate-news.js'))) {
  runValidationCli().catch(console.error);
}
