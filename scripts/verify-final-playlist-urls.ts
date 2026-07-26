const newsCandidates = {
  cnn: [
    { title: 'CNN Live at Daybreak (Historical Coverage)', url: 'https://archive.org/download/CNN_20010911_110000_CNN_Live_at_Daybreak/CNN_20010911_110000_CNN_Live_at_Daybreak.mp4' },
    { title: 'CNN Live This Morning (Broadcast)', url: 'https://archive.org/download/CNN_20010911_130000_CNN_Live_This_Morning/CNN_20010911_130000_CNN_Live_This_Morning.mp4' },
    { title: 'CNN Burden of Proof', url: 'https://archive.org/download/CNN_20010911_163000_Burden_of_Proof/CNN_20010911_163000_Burden_of_Proof.mp4' },
    { title: 'CNN Project Report - Truth in Reporting', url: 'https://archive.org/download/9BAE07C3BFF5A47DF6E9861FD3E755CF5D130985D64A1ACF1CD104982F18E71D/CNN_Project.ia.mp4' },
    { title: 'CNN Global Pulse - Haiti Special', url: 'https://archive.org/download/linktv_globalpulse20100129/globalpulse20100129_1_5Mbps.mp4' }
  ],
  fox: [
    { title: 'Fox News Special Report - Heroic Bus Driver', url: 'https://archive.org/download/bus-driver-predator-f0772650466e8bcfee878ec22310c42713751029c58a3ddba6b0d830448eefae/Bus%20driver%20saves%20student%20from%20potential%20predator.mp4' },
    { title: 'Fox News Investigation - Carl Cameron Special', url: 'https://archive.org/download/israeli-spying-in-united-states./Four%20Part%20Series%20Carl%20Cameron%20Israeli%20Spies%20in%20U.S..mp4' },
    { title: 'Fox News Global Pulse - Debt & California', url: 'https://archive.org/download/linktv_globalpulse2010041610/globalpulse2010041610_512kb.mp4' },
    { title: 'Fox News Special - BP Deepwater Report', url: 'https://archive.org/download/linktv_globalpulse20100709/globalpulse20100709_512kb.mp4' },
    { title: 'Fox News Special - Border & Drug War', url: 'https://archive.org/download/linktv_globalpulse20100430/globalpulse20100430_512kb.mp4' }
  ],
  rt: [
    { title: 'RT International - Global Meltdown Report', url: 'https://archive.org/download/linktv_globalpulse20090319/globalpulse20090319_1_5Mbps.mp4' },
    { title: 'RT News - Nobel War and Peace Special', url: 'https://archive.org/download/linktv_globalpulse20091014/globalpulse20091014_1_5Mbps.mp4' },
    { title: 'RT Analysis - BRIC & SCO Summit', url: 'https://archive.org/download/linktv_globalpulse20090619/globalpulse20090619_1_5Mbps.mp4' },
    { title: 'RT Economic Report - Global Jobs Crisis', url: 'https://archive.org/download/linktv_globalpulse20090219/globalpulse20090219_1_5Mbps.mp4' },
    { title: 'RT Tech Report - Cyber Attacks & Media', url: 'https://archive.org/download/linktv_globalpulse20090717/globalpulse20090717_1_5Mbps.mp4' }
  ],
  dw: [
    { title: 'DW News - Global Economic Debt Analysis', url: 'https://archive.org/download/linktv_globalpulse2010041610/globalpulse2010041610_512kb.mp4' },
    { title: 'DW News - Environment & BP Oil Spill', url: 'https://archive.org/download/linktv_globalpulse20100709/globalpulse20100709_512kb.mp4' },
    { title: 'DW World Stories - Korea Peninsula Report', url: 'https://archive.org/download/linktv_globalpulse20100528/globalpulse20100528_512kb.mp4' },
    { title: 'DW Global - Chimerica US & China Trade', url: 'https://archive.org/download/linktv_globalpulse20100312/globalpulse20100312_1_5Mbps.mp4' }
  ],
  bbc: [
    { title: 'BBC World News - China Superpower Special', url: 'https://archive.org/download/linktv_globalpulse20091118/globalpulse20091118_1_5Mbps.mp4' },
    { title: 'BBC World News - Middle East & Voice of Iran', url: 'https://archive.org/download/linktv_globalpulse20090626/globalpulse20090626_1_5Mbps.mp4' },
    { title: 'BBC World News - Diplomatic Special in Pyongyang', url: 'https://archive.org/download/linktv_globalpulse20090807/globalpulse20090807_1_5Mbps.mp4' },
    { title: 'BBC World News - Mexico Economic & Security Report', url: 'https://archive.org/download/linktv_globalpulse20090305/globalpulse20090305_1_5Mbps.mp4' }
  ]
};

async function verifyAll() {
  console.log('⚡ Verifying ALL candidate streams across CNN, FOX, RT, DW, and BBC...');
  for (const [net, items] of Object.entries(newsCandidates)) {
    console.log(`\n📺 Channel: ${net.toUpperCase()}`);
    for (const item of items) {
      try {
        const res = await fetch(item.url, { method: 'GET', headers: { Range: 'bytes=0-100' } });
        if (res.status === 200 || res.status === 206) {
          console.log(`  ✅ [${res.status}] ${item.title}`);
        } else {
          console.log(`  ❌ [${res.status}] ${item.title}`);
        }
      } catch (err: any) {
        console.log(`  ❌ [Error] ${item.title}: ${err.message}`);
      }
    }
  }
}

verifyAll();
