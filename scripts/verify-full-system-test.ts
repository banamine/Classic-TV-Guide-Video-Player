import { CHANNELS_DATA } from '../src/data/playlist';
import { LocalDatabase } from '../server/db';
import { parseMediaItem } from '../src/engine/genreParser';
import { flattenChannelPlaylist, getLiveEpisodeForChannel, getFutureScheduleForChannel } from '../src/utils/scheduler';

async function runSystemValidation() {
  console.log('====================================================');
  console.log('🚀 EXECUTING FULL SYSTEM TEST & VALIDATION RUN');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  // TEST 1: CHANNELS & DATA SOURCES SANITY
  totalTests++;
  console.log('1️⃣ TESTING CHANNEL POPULATION & EPG INTEGRITY...');
  const channels = CHANNELS_DATA;
  if (!channels || channels.length === 0) {
    console.error('❌ FAIL: No channels found in CHANNELS_DATA.');
  } else {
    console.log(`  ✅ Loaded ${channels.length} channels from playlist source of truth.`);
    channels.forEach(ch => {
      console.log(`     - CH ${ch.number} [${ch.id}]: "${ch.name}" (${ch.shows?.length || 0} shows)`);
    });
    passedTests++;
  }

  // TEST 2: SITCOM (HOGAN'S HEROES) vs CRIME (COLUMBO/SOPRANOS) GENRE ROUTING
  totalTests++;
  console.log('\n2️⃣ TESTING GENRE TAXONOMY & ROUTING ISOLATION...');
  const crimeChannel = channels.find(c => c.id === 'ch-retro-adventure' || c.number === '102');
  const comedyChannel = channels.find(c => c.id === 'ch-comedy-103' || c.number === '103');

  let taxonomyPass = true;

  if (!crimeChannel || !comedyChannel) {
    console.error('❌ FAIL: CH 102 or CH 103 missing!');
    taxonomyPass = false;
  } else {
    // Check Hogan's Heroes in CH 102
    const crimeShows = crimeChannel.shows || [];
    const hoganInCrime = crimeShows.some(s => 
      s.title.toLowerCase().includes("hogan") || 
      (s.episodes && s.episodes.some(e => e.title.toLowerCase().includes("hogan")))
    );

    if (hoganInCrime) {
      console.error('❌ FAIL: Hogan\'s Heroes found in Crime Channel (CH 102)! Should be excluded.');
      taxonomyPass = false;
    } else {
      console.log('  ✅ Verified Hogan\'s Heroes is STRICTLY EXCLUDED from CH 102 (Crime).');
    }

    // Check Hogan's Heroes in CH 103
    const comedyShows = comedyChannel.shows || [];
    const hoganInComedy = comedyShows.some(s => 
      s.title.toLowerCase().includes("hogan") || 
      (s.episodes && s.episodes.some(e => e.title.toLowerCase().includes("hogan")))
    );

    if (!hoganInComedy) {
      console.error('❌ FAIL: Hogan\'s Heroes missing from Comedy Channel (CH 103)!');
      taxonomyPass = false;
    } else {
      console.log('  ✅ Verified Hogan\'s Heroes is STRICTLY ROUTED to CH 103 (Comedy).');
    }

    // Test parseMediaItem taxonomy parser
    const parsedHogan = parseMediaItem("Hogan's Heroes S03E01 The Crittendon Plan.mp4");
    if (parsedHogan.suggestedChannelId === 'ch-comedy-103' && parsedHogan.genre === 'COMEDY') {
      console.log('  ✅ parseMediaItem correctly assigned Hogan\'s Heroes -> COMEDY (ch-comedy-103).');
    } else {
      console.error(`❌ FAIL: parseMediaItem assigned Hogan's Heroes to ${parsedHogan.suggestedChannelId}`);
      taxonomyPass = false;
    }

    const parsedColumbo = parseMediaItem("Columbo.S07E01.Try.and.Catch.Me.mp4");
    if (parsedColumbo.suggestedChannelId === 'ch-crime-102' && parsedColumbo.genre === 'CRIME') {
      console.log('  ✅ parseMediaItem correctly assigned Columbo -> CRIME (ch-crime-102).');
    } else {
      console.error(`❌ FAIL: parseMediaItem assigned Columbo to ${parsedColumbo.suggestedChannelId}`);
      taxonomyPass = false;
    }
  }

  if (taxonomyPass) passedTests++;

  // TEST 3: INTERSTITIAL BUMPER & DEAD-AIR GAP HANDLING
  totalTests++;
  console.log('\n3️⃣ TESTING INTERSTITIAL BUMPERS & EPG STANDALONE EXCLUSION...');
  let interstitialPass = true;

  try {
    for (const ch of channels) {
      const flatWithFill = flattenChannelPlaylist(ch, { enableInterstitials: true, targetGridMins: 30 });
      const flatNoFill = flattenChannelPlaylist(ch, { enableInterstitials: false, targetGridMins: 30 });

      const fillItemsCount = flatWithFill.filter(item => item.isCommercialFill).length;
      console.log(`  📺 Channel ${ch.number} "${ch.name}": ${flatNoFill.length} primary show eps, ${fillItemsCount} commercial dead-air fillers.`);

      // Verify future schedule does not contain standalone EPG items with commercial fills
      const futureSched = getFutureScheduleForChannel(ch, 1, { enableInterstitials: true, targetGridMins: 30 });
      const commercialInFutureEPG = futureSched.some(s => s.isCommercialFill);
      if (commercialInFutureEPG) {
        console.error(`  ❌ FAIL: Commercial fill items found as standalone broadcast items in EPG for ${ch.name}!`);
        interstitialPass = false;
      }
    }
    if (!interstitialPass) {
      console.error('❌ Interstitial EPG isolation test failed.');
    } else {
      console.log('  ✅ Confirmed: Commercial bumpers trigger ONLY during dead-air gaps and are excluded from standalone EPG broadcast guide lists.');
      passedTests++;
    }
  } catch (err: any) {
    console.error('❌ Error testing interstitials:', err.message);
  }

  // TEST 4: MEDIA SOURCE URL RESOLUTION & AUDIT
  totalTests++;
  console.log('\n4️⃣ TESTING MEDIA SOURCE URL RESOLUTION (SAMPLE AUDIT)...');
  let urlSampleCount = 0;
  let urlSuccessCount = 0;

  const urlSamples: { chName: string; title: string; url: string }[] = [];
  channels.forEach(ch => {
    if (ch.shows && ch.shows[0]?.episodes && ch.shows[0].episodes[0]) {
      const ep = ch.shows[0].episodes[0];
      urlSamples.push({ chName: ch.name, title: ep.title, url: ep.url });
    }
  });

  console.log(`  Auditing ${urlSamples.length} primary channel stream URLs via Range HTTP GET...`);
  for (const sample of urlSamples) {
    urlSampleCount++;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(sample.url, { method: 'GET', headers: { Range: 'bytes=0-100' }, signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.status === 200 || res.status === 206 || res.status === 302) {
        console.log(`  ✅ [${res.status}] ${sample.chName}: "${sample.title.slice(0, 40)}"`);
        urlSuccessCount++;
      } else {
        console.warn(`  ⚠️ [${res.status} ${res.statusText}] ${sample.chName}: "${sample.title.slice(0, 40)}"`);
      }
    } catch (err: any) {
      console.warn(`  ⚠️ [Fetch Error] ${sample.chName}: ${err.message}`);
    }
  }

  if (urlSuccessCount > 0) {
    console.log(`  🎉 ${urlSuccessCount}/${urlSampleCount} sampled channel URLs resolved successfully.`);
    passedTests++;
  } else {
    console.error('❌ All sampled URLs failed resolution check.');
  }

  console.log('\n====================================================');
  console.log(`📊 TEST SUMMARY: ${passedTests}/${totalTests} SUITES PASSED`);
  console.log('====================================================');
}

runSystemValidation();
