export interface EPGChannelData {
  id: string;
  name: string;
  number?: string;
  programs?: Array<{
    title: string;
    startTime: string;
    duration: number;
    description?: string;
  }>;
}

export interface EPGPayload {
  channels: EPGChannelData[];
  lastUpdated?: string;
  fallbackMode?: boolean;
}

const STATIC_EPG_FALLBACK: EPGPayload = {
  channels: [],
  lastUpdated: new Date().toISOString(),
  fallbackMode: true,
};

/**
 * Fetches EPG JSON data with exponential backoff retry logic.
 */
export async function fetchEPGWithRetry(
  url: string,
  retries = 3,
  baseDelayMs = 1000
): Promise<EPGPayload> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch EPG data`);
      }
      const data = await response.json();
      return data as EPGPayload;
    } catch (error) {
      console.warn(`EPG fetch attempt ${attempt + 1}/${retries} failed for ${url}:`, error);

      if (attempt === retries - 1) {
        console.error('All EPG fetch retries failed. Reverting to static fallback data.');
        return STATIC_EPG_FALLBACK;
      }

      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return STATIC_EPG_FALLBACK;
}
