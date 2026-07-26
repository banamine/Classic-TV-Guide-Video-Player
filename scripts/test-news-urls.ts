import { CHANNELS_DATA } from '../src/data/playlist';
import fs from 'fs';
import path from 'path';

async function testNewsUrls() {
  console.log('🔍 Testing news channel video URLs across database and playlist...');

  const dbPath = path.join(process.cwd(), 'data', 'database.json');
  let dbChannels = CHANNELS_DATA;
  if (fs.existsSync(dbPath)) {
    const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    if (dbData.channels) {
      dbChannels = dbData.channels;
    }
  }

  const newsChannels = dbChannels.filter(c => c.category === 'News' || c.id.startsWith('ch-'));

  for (const ch of newsChannels) {
    console.log(`\n📺 Station: [CH ${ch.number}] ${ch.name} (ID: ${ch.id})`);
    if (!ch.shows || ch.shows.length === 0) {
      console.error(`  ❌ No shows found for channel ${ch.name}`);
      continue;
    }

    for (const show of ch.shows) {
      console.log(`  🎬 Show: "${show.title}" (${show.episodes?.length || 0} episodes)`);
      if (show.episodes && show.episodes.length > 0) {
        for (let i = 0; i < Math.min(3, show.episodes.length); i++) {
          const ep = show.episodes[i];
          console.log(`    📹 Ep ${i+1}: "${ep.title}"`);
          console.log(`       URL: ${ep.url}`);
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const res = await fetch(ep.url, { method: 'HEAD', signal: controller.signal }).finally(() => clearTimeout(timeout));
            console.log(`       Status: ${res.status} ${res.statusText} (${res.headers.get('content-type') || 'no type'})`);
          } catch (e: any) {
            console.log(`       Status Check Error: ${e.message}`);
          }
        }
      }
    }
  }
}

testNewsUrls();
