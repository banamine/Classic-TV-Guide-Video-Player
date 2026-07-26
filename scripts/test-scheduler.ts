import { CHANNELS_DATA } from '../src/data/playlist';
import { getLiveEpisodeForChannel } from '../src/utils/scheduler';

function runChannelHopSimulationTest() {
  console.log('🧪 [Channel Hop Diagnostic Test] Starting simulation...');

  if (!CHANNELS_DATA || CHANNELS_DATA.length === 0) {
    console.error('❌ [Test Failed]: No channels found in CHANNELS_DATA!');
    process.exit(1);
  }

  const simulatedTimeMs = Date.now();
  console.log(`🕒 Simulated Broadcast Timestamp: ${new Date(simulatedTimeMs).toISOString()}`);

  let testCount = 0;
  let passCount = 0;

  for (let i = 0; i < CHANNELS_DATA.length; i++) {
    const targetChannel = CHANNELS_DATA[i];
    testCount++;

    try {
      console.log(`\n📺 Testing Channel Hop to CH ${targetChannel.number} "${targetChannel.name}"...`);
      const liveInfo = getLiveEpisodeForChannel(targetChannel, simulatedTimeMs);

      const { show, episode, seekOffsetSeconds, remainingSeconds } = liveInfo;

      if (!show || !episode || typeof seekOffsetSeconds !== 'number') {
        console.error(`  ❌ Failed: Missing episode or seekOffset for channel "${targetChannel.name}"`);
        continue;
      }

      console.log(`  ✅ Scheduled Show: "${show.title}"`);
      console.log(`  ✅ Scheduled Episode: "${episode.title}" (ID: ${episode.id})`);
      console.log(`  ⏱️ Seek Offset: ${seekOffsetSeconds.toFixed(1)}s / Remaining: ${remainingSeconds.toFixed(1)}s`);

      // Verify that offset is non-negative and less than total duration
      const totalDurationMs = episode.durationMs || (episode.runtimeMins ? episode.runtimeMins * 60 * 1000 : 1800000);
      const totalDurationSec = totalDurationMs / 1000;

      if (seekOffsetSeconds >= 0 && seekOffsetSeconds <= totalDurationSec) {
        console.log(`  🎉 Alignment Verified: Seek offset ${seekOffsetSeconds.toFixed(1)}s is valid for episode length ${totalDurationSec}s.`);
        passCount++;
      } else {
        console.error(`  ❌ Alignment Error: Seek offset ${seekOffsetSeconds}s out of bounds for duration ${totalDurationSec}s.`);
      }
    } catch (err: any) {
      console.error(`  ❌ Error on Channel Hop to "${targetChannel.name}": ${err.message}`);
    }
  }

  console.log(`\n📊 [Test Summary]: Passed ${passCount}/${testCount} channel hop alignment checks.`);
  if (passCount === testCount && testCount > 0) {
    console.log('✨ All channel hop tests succeeded perfectly!');
  } else {
    console.error('❌ Some channel hop tests failed.');
    process.exit(1);
  }
}

runChannelHopSimulationTest();
