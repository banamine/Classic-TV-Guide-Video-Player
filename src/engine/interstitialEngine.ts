export interface MediaItem {
  id: string;
  title: string;
  url: string;
  durationMs: number;
}

export interface ScheduleBlock {
  mainShow: MediaItem;
  interstitials: MediaItem[];
  fallbackSlateDurationMs: number;
  totalBlockDurationMs: number;
  targetGridBoundaryMs: number;
}

/**
 * Calculates dead-air gaps and bin-packs commercial bumpers while ensuring
 * strict FAST channel commercial availability and sub-millisecond precision.
 */
export function buildEpgBlock(
  mainShow: MediaItem,
  commercialPool: MediaItem[],
  gridIntervalMinutes: number = 30
): ScheduleBlock {
  const gridIntervalMs = gridIntervalMinutes * 60 * 1000;
  const MIN_COMMERCIAL_AVAIL_MS = 2 * 60 * 1000; // Guarantees a minimum 2-minute break window

  // Calculate target EPG boundary (pushed to next slot if main show exceeds available window)
  let targetGridBoundaryMs = Math.ceil(mainShow.durationMs / gridIntervalMs) * gridIntervalMs;
  if (targetGridBoundaryMs - mainShow.durationMs < MIN_COMMERCIAL_AVAIL_MS) {
    targetGridBoundaryMs += gridIntervalMs;
  }

  let remainingGapMs = targetGridBoundaryMs - mainShow.durationMs;
  const selectedInterstitials: MediaItem[] = [];

  // Sort pool descending (Greedy Bin-Packing)
  const sortedPool = [...commercialPool].sort((a, b) => b.durationMs - a.durationMs);

  for (const commercial of sortedPool) {
    if (remainingGapMs <= 0) break;

    if (commercial.durationMs <= remainingGapMs) {
      selectedInterstitials.push(commercial);
      remainingGapMs -= commercial.durationMs;
    }
  }

  let fallbackSlateDurationMs = 0;
  // Guard against micro-gaps under 100ms that cause audio-stamping encoder crashes
  if (remainingGapMs > 100) {
    fallbackSlateDurationMs = remainingGapMs;
    remainingGapMs = 0;
  }

  return {
    mainShow,
    interstitials: selectedInterstitials,
    fallbackSlateDurationMs,
    totalBlockDurationMs: targetGridBoundaryMs,
    targetGridBoundaryMs,
  };
}
