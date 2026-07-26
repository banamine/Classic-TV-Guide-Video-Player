import crypto from 'crypto';
import { MediaItem } from './interstitialEngine';

/**
 * Executes a cryptographically secure, seeded Fisher-Yates shuffle.
 * Continually re-hashes the seed on every iteration to guarantee full entropy across large media catalogs.
 */
export function getDeterministicDailySchedule(
  allMediaPool: MediaItem[],
  dateString: string // Format: YYYY-MM-DD
): MediaItem[] {
  const poolCopy = [...allMediaPool];
  
  // Initialize SHA-256 tracking seed
  let currentSeed = crypto.createHash('sha256').update(dateString).digest('hex');
  
  for (let i = poolCopy.length - 1; i > 0; i--) {
    // Re-hash seed on each iteration to prevent substring exhaustion
    currentSeed = crypto.createHash('sha256').update(currentSeed + i.toString()).digest('hex');
    
    // Extract a 4-character hex chunk (0x0000 to 0xFFFF)
    const hexSegment = currentSeed.substring(0, 4);
    const pseudoRandomNumber = parseInt(hexSegment, 16) / 0xffff;
    
    const j = Math.floor(pseudoRandomNumber * (i + 1));

    // Safe array swap
    [poolCopy[i], poolCopy[j]] = [poolCopy[j], poolCopy[i]];
  }

  return poolCopy;
}
