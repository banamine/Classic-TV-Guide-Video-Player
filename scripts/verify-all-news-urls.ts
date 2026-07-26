const testUrls = [
  // CNN
  { net: 'CNN', title: 'CNN Newsroom (serve format)', url: 'https://archive.org/serve/CNNW_20230521_230000_CNN_Newsroom_With_Jim_Acosta/CNNW_20230521_230000_CNN_Newsroom_With_Jim_Acosta.mp4?t=0/3600&exact=1&ignore=x.mp4' },
  { net: 'CNN', title: 'CNN Project IA', url: 'https://archive.org/download/9BAE07C3BFF5A47DF6E9861FD3E755CF5D130985D64A1ACF1CD104982F18E71D/CNN_Project.ia.mp4' },

  // FOX
  { net: 'FOX', title: 'The Five (serve format)', url: 'https://archive.org/serve/FOXNEWSW_20241024_040000_The_Five/FOXNEWSW_20241024_040000_The_Five.mp4?t=0/3600&exact=1&ignore=x.mp4' },
  { net: 'FOX', title: 'Bus Driver predator', url: 'https://archive.org/download/bus-driver-predator-f0772650466e8bcfee878ec22310c42713751029c58a3ddba6b0d830448eefae/Bus%20driver%20saves%20student%20from%20potential%20predator.mp4' },

  // RT
  { net: 'RT', title: 'RT News (serve format)', url: 'https://archive.org/serve/RT_20220508_190000_News/RT_20220508_190000_News.mp4?t=0/3600&exact=1&ignore=x.mp4' },
  { net: 'RT', title: 'Sanchez Effect', url: 'https://archive.org/serve/RT_20260722_063000_Sanchez_Effect/RT_20260722_063000_Sanchez_Effect.mp4?t=0/3662&exact=1&ignore=x.mp4' },

  // DW
  { net: 'DW', title: 'DW Global Pulse', url: 'https://archive.org/download/linktv_globalpulse2010041610/globalpulse2010041610_512kb.mp4' },
  { net: 'DW', title: 'DW News LinkTV', url: 'https://archive.org/download/LINKTV_20190621_220000_DW_News/LINKTV_20190621_220000_DW_News.mp4' },

  // BBC
  { net: 'BBC', title: 'BBC World News America', url: 'https://archive.org/download/KQED_20191106_223000_BBC_World_News_America/KQED_20191106_223000_BBC_World_News_America.mp4' }
];

async function runVerification() {
  console.log('🚀 Verifying news stream URLs status...');
  for (const item of testUrls) {
    try {
      const res = await fetch(item.url, { method: 'GET', headers: { Range: 'bytes=0-100' } });
      console.log(`[${item.net}] ${item.title}: Status ${res.status} ${res.statusText} (${res.headers.get('content-type') || 'no-type'})`);
    } catch (err: any) {
      console.error(`[${item.net}] ${item.title}: Error - ${err.message}`);
    }
  }
}

runVerification();
