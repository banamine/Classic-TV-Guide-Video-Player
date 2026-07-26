import fs from 'fs';

interface NetworkQuery {
  net: string;
  query: string;
}

const queries: NetworkQuery[] = [
  { net: 'CNN', query: 'title:("CNN") AND mediatype:movies' },
  { net: 'FOX', query: 'title:("Fox News" OR "FOX") AND mediatype:movies' },
  { net: 'RT', query: 'title:("RT" OR "Russia Today") AND mediatype:movies' },
  { net: 'DW', query: 'title:("DW News" OR "Deutsche Welle") AND mediatype:movies' },
  { net: 'BBC', query: 'title:("BBC News" OR "BBC") AND mediatype:movies' },
  
];

async function findStreams() {
  const results: Record<string, any[]> = {};

  for (const q of queries) {
    results[q.net] = [];
    console.log(`\n🔎 Querying ${q.net}...`);
    const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q.query)}&fl[]=identifier&fl[]=title&fl[]=description&sort[]=downloads+desc&rows=30&output=json`;
    
    try {
      const res = await fetch(searchUrl);
      if (!res.ok) continue;
      const data = await res.json() as any;
      const docs = data.response?.docs || [];

      for (const doc of docs) {
        if (results[q.net].length >= 5) break;
        const id = doc.identifier;
        if (!id) continue;

        try {
          const metaRes = await fetch(`https://archive.org/metadata/${id}/files`);
          if (!metaRes.ok) continue;
          const meta = await metaRes.json() as any;
          const files = meta.result || [];
          
          // Find cleanest mp4
          const mp4 = files.find((f: any) => 
            f.name && 
            f.name.endsWith('.mp4') && 
            !f.name.includes('thumb') && 
            !f.name.includes('_512kb') &&
            f.size > 1000000
          ) || files.find((f: any) => f.name && f.name.endsWith('.mp4') && !f.name.includes('thumb'));

          if (mp4) {
            const url = `https://archive.org/download/${id}/${encodeURIComponent(mp4.name)}`;
            const check = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-100' } });
            if (check.status === 200 || check.status === 206) {
              console.log(`  ✅ [${q.net}] ${doc.title}`);
              console.log(`     URL: ${url}`);
              results[q.net].push({
                id,
                title: doc.title,
                description: doc.description || `${q.net} news broadcast coverage.`,
                url,
                duration: mp4.length ? Math.round(parseFloat(mp4.length)) : 1800
              });
            }
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  fs.writeFileSync('scripts/verified_news_streams.json', JSON.stringify(results, null, 2));
  console.log('\n🎉 Saved verified working news streams to scripts/verified_news_streams.json!');
}

findStreams();
