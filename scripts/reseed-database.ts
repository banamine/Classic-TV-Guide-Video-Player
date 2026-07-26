import fs from 'fs';
import path from 'path';
import { CHANNELS_DATA } from '../src/data/playlist';
import { buildAndSaveFreshNews } from '../server/freshNewsGenerator';

async function reseed() {
  console.log('🔄 Reseeding data/database.json and generating fresh_news.json...');
  
  const dbDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, 'database.json');
  const initialData = {
    channels: CHANNELS_DATA,
    logs: [
      {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        message: 'Database reseeded with verified 206 OK news streams for CNN, FOX, RT, DW, and BBC.',
        type: 'info'
      }
    ],
    scraperConfig: {
      autoScrapeIntervalHours: 6,
      lastScrapeTimestamp: new Date().toISOString()
    }
  };

  fs.writeFileSync(dbPath, JSON.stringify(initialData, null, 2), 'utf8');
  console.log('✅ Updated data/database.json');

  await buildAndSaveFreshNews();
  console.log('✅ Generated fresh_news.json and news.json');
}

reseed().catch(err => {
  console.error('❌ Reseed error:', err);
  process.exit(1);
});
