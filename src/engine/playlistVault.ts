import { parseMediaItem, ParsedMediaMetadata } from './genreParser';

export interface VaultItem extends ParsedMediaMetadata {
  id: string;
  url: string;
  durationMs?: number;
  runtimeMins?: number;
  addedAt?: number;
}

export interface ChannelVault {
  channelId: string;
  channelName: string;
  category: string;
  items: VaultItem[];
  seed: number;
}

/**
 * Per-Channel Playlist Vault Engine
 * Maintains segregated, genre-filtered queues with independent per-channel randomization
 * ensuring Channel A's queue and shuffle state never bleed into Channel B.
 */
export class PlaylistVaultManager {
  private vaults: Map<string, ChannelVault> = new Map();

  constructor() {
    this.initializeDefaultVaults();
  }

  private initializeDefaultVaults() {
    const defaultChannels = [
      { id: 'ch-wstn-101', name: 'Classic Westerns HD', category: 'Westerns', seed: 101 },
      { id: 'ch-crime-102', name: 'Classic Cinema & TV Crime', category: 'Crime', seed: 102 },
      { id: 'ch-comedy-103', name: 'Classic Sitcoms & Comedy', category: 'Comedy', seed: 103 },
      { id: 'ch-news-archive', name: 'Retro News Network', category: 'Archive News', seed: 104 },
      { id: 'ch-news-current', name: 'Headline News Today', category: 'Current Events', seed: 105 },
      { id: 'ch-911-archive', name: 'September 9/11 Archive Channel', category: 'News Archive', seed: 106 },
      { id: 'ch-master-shuffle', name: 'Master Showcase (All Combined)', category: 'General', seed: 108 },
    ];

    for (const ch of defaultChannels) {
      this.vaults.set(ch.id, {
        channelId: ch.id,
        channelName: ch.name,
        category: ch.category,
        items: [],
        seed: ch.seed,
      });
    }
  }

  /**
   * Retrieves or lazily creates a segregated vault for a specific channel ID
   */
  public getVault(channelId: string, channelName: string = 'Custom Channel', category: string = 'General'): ChannelVault {
    if (!this.vaults.has(channelId)) {
      const channelHash = channelId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      this.vaults.set(channelId, {
        channelId,
        channelName,
        category,
        items: [],
        seed: channelHash || 999,
      });
    }
    return this.vaults.get(channelId)!;
  }

  /**
   * Segregates raw M3U / playlist items into independent per-channel vaults based on genre rules
   */
  public populateSegregatedVaults(rawItems: { title: string; url: string; durationMs?: number }[]): void {
    // Clear non-master items first to allow clean re-population
    this.vaults.forEach((vault) => {
      vault.items = [];
    });

    for (let idx = 0; idx < rawItems.length; idx++) {
      const rawItem = rawItems[idx];
      const parsed = parseMediaItem(rawItem.title);
      const vaultItem: VaultItem = {
        ...parsed,
        id: `vault-item-${idx}-${Math.random().toString(36).substr(2, 6)}`,
        url: rawItem.url,
        durationMs: rawItem.durationMs || 1800000,
        runtimeMins: Math.ceil((rawItem.durationMs || 1800000) / 60000),
        addedAt: Date.now(),
      };

      // Add to dedicated channel vault based on genre classification
      const targetVaultId = parsed.suggestedChannelId;
      const targetVault = this.getVault(targetVaultId);
      targetVault.items.push(vaultItem);

      // Add to Master Showcase vault as an isolated reference
      const masterVault = this.getVault('ch-master-shuffle');
      masterVault.items.push({ ...vaultItem, id: `master-${vaultItem.id}` });
    }
  }

  /**
   * Sets items explicitly for a channel's independent vault
   */
  public setVaultItems(channelId: string, items: VaultItem[]): void {
    const vault = this.getVault(channelId);
    vault.items = [...items];
  }

  /**
   * Adds a single item to a channel's independent vault
   */
  public addItemToVault(channelId: string, item: VaultItem): void {
    const vault = this.getVault(channelId);
    vault.items.push(item);
  }

  /**
   * Generates an independently randomized queue for a single channel using deterministic pseudo-random shuffling.
   * Ensures Channel A's queue order is completely segregated from Channel B.
   */
  public getRandomizedQueue(channelId: string, dateSeedStr: string = new Date().toISOString().split('T')[0]): VaultItem[] {
    const vault = this.getVault(channelId);
    if (vault.items.length === 0) return [];

    // Combine date string and channel-specific seed to guarantee independent per-channel randomization
    const seedInput = `${dateSeedStr}_${channelId}_${vault.seed}`;
    let numericSeed = 0;
    for (let i = 0; i < seedInput.length; i++) {
      numericSeed = (numericSeed * 31 + seedInput.charCodeAt(i)) % 2147483647;
    }

    // Pseudo-random generator (LCG)
    const lcg = () => {
      numericSeed = (numericSeed * 16807) % 2147483647;
      return (numericSeed - 1) / 2147483646;
    };

    // Fisher-Yates shuffle on a cloned list
    const queue = [...vault.items];
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(lcg() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }

    return queue;
  }

  /**
   * Returns all segregated channel vaults
   */
  public getAllVaults(): Map<string, ChannelVault> {
    return this.vaults;
  }

  /**
   * Clears a channel's vault
   */
  public clearVault(channelId: string): void {
    if (this.vaults.has(channelId)) {
      this.vaults.get(channelId)!.items = [];
    }
  }
}

// Global singleton instance for app-wide per-channel playlist segregation
export const globalPlaylistVault = new PlaylistVaultManager();
