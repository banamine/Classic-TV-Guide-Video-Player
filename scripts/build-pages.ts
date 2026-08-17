import * as fs from 'fs';
import * as path from 'path';
import { parseM3U } from '../src/utils/m3uParser';
import { generateStaticPlayerHtml } from '../src/utils/staticPlayerGenerator';
import { CHANNELS } from '../src/data/channels';
import { writeDailyScheduleFiles } from '../src/engine/scheduleManifestGenerator';

function run() {
  console.log('⚡ [Pages Build Script]: Starting automated standalone player build...');

  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
  if (!isGitHubActions) {
    console.log('ℹ️ [Pages Build Script]: Not running inside GitHub Actions. Skipping standalone page overwrite.');
    return;
  }

  const playlistPath = path.join(process.cwd(), 'playlist.m3u');
  const distDir = path.join(process.cwd(), 'dist');
  const targetHtmlPath = path.join(distDir, 'index.html');
  const hlsSource = path.join(process.cwd(), 'public', 'hls.min.js');
  const hlsDest = path.join(distDir, 'hls.min.js');

  let channels = CHANNELS;
  let dataSourceName = 'Pre-seeded TV Guides';

  try {
    if (fs.existsSync(playlistPath)) {
      console.log(`📂 [Pages Build Script]: Found customized playlist file at "${playlistPath}".`);
      const m3uText = fs.readFileSync(playlistPath, 'utf-8');
      const parsed = parseM3U(m3uText, 'playlist.m3u');
      if (parsed && parsed.length > 0) {
        channels = parsed;
        dataSourceName = 'Committed M3U Playlist';
        console.log(`✅ [Pages Build Script]: Successfully parsed ${parsed.length} channels from "playlist.m3u".`);
      } else {
        console.warn(`⚠️ [Pages Build Script]: Parsed 0 channels from "playlist.m3u". Falling back to default channels.`);
      }
    } else {
      console.log(`ℹ️ [Pages Build Script]: No custom "playlist.m3u" found. Using default dataset.`);
    }
  } catch (err: any) {
    console.error(`❌ [Pages Build Script]: Error reading/parsing playlist.m3u: ${err.message}. Falling back to default.`);
  }

  try {
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }

    // Overwrite dist/index.html with the standalone cinematic player
    console.log(`🔨 [Pages Build Script]: Generating standalone cinematic player...`);
    const playerHtml = generateStaticPlayerHtml(channels, 'Classic TV Guide & Video Player');
    fs.writeFileSync(targetHtmlPath, playerHtml, 'utf-8');
    console.log(`🚀 [Pages Build Script]: Standalone player committed to "${targetHtmlPath}" using datasource: "${dataSourceName}".`);

    // Copy local hls.min.js to dist if it exists for local offline support
    if (fs.existsSync(hlsSource)) {
      fs.copyFileSync(hlsSource, hlsDest);
      console.log(`✅ [Pages Build Script]: Copied "hls.min.js" to build output directory.`);
    }

    // Export daily schedule manifest JSON
    console.log(`📅 [Pages Build Script]: Exporting daily static schedule JSON manifests...`);
    const scheduleFiles = writeDailyScheduleFiles(channels);
    console.log(`✅ [Pages Build Script]: Wrote ${scheduleFiles.length} schedule manifest files.`);
  } catch (err: any) {
    console.error(`❌ [Pages Build Script]: Error writing output files: ${err.message}`);
    process.exit(1);
  }

  console.log('🎉 [Pages Build Script]: Standalone page generation complete!');
}

run();
