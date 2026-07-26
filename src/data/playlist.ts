/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Channel, Show, Episode } from '../types';

// Sample episode data for seeding
const createEpisode = (id: string, title: string, url: string, durationMs = 3600000): Episode => ({
  id,
  title,
  url,
  durationMs,
  runtimeMins: durationMs / 60000,
});

const createShow = (id: string, title: string, genre: string, episodes: Episode[]): Show => ({
  id,
  title,
  description: `Classic ${genre} series`,
  year: '1960',
  genre,
  episodes,
});

// Default channels with minimal seed data
export const CHANNELS_DATA: Channel[] = [
  {
    id: 'ch-classic-western',
    number: '101',
    name: 'Classic Westerns',
    tagline: 'Have Gun – Will Travel / Bonanza',
    category: 'Classic TV',
    logoText: 'WEST',
    accentColor: '#d4a574',
    logoUrl: '/assets/logos/western.png',
    shows: [
      createShow('show-1', 'Have Gun – Will Travel', 'Western', [
        createEpisode('ep-1', 'Pilot Episode', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'),
        createEpisode('ep-2', 'Episode 2', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'),
      ]),
      createShow('show-2', 'Bonanza', 'Western', [
        createEpisode('ep-3', 'Cartwright Family', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'),
      ]),
    ],
  },
  {
    id: 'ch-mystery-crime',
    number: '102',
    name: 'Mystery & Crime',
    tagline: 'Columbo & Classic Detectives',
    category: 'Classic TV',
    logoText: 'CRIME',
    accentColor: '#8b0000',
    logoUrl: '/assets/logos/crime.png',
    shows: [
      createShow('show-3', 'Columbo', 'Crime Drama', [
        createEpisode('ep-4', 'Ransom for a Dead Man', 'https://playertest.longtailvideo.com/adaptive/bipbop/gear4/prog_index.m3u8'),
      ]),
    ],
  },
  {
    id: 'ch-retro-adventure',
    number: '103',
    name: 'Cinema Live',
    tagline: '24/7 Curated Classic Features',
    category: 'Cinema',
    logoText: 'CINEMA',
    accentColor: '#ffd700',
    logoUrl: '/assets/logos/cinema.png',
    shows: [
      createShow('show-4', 'Classic Features', 'Cinema', [
        createEpisode('ep-5', 'Tears of Steel', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4', 6060000),
        createEpisode('ep-6', 'Big Buck Bunny', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'),
      ]),
    ],
  },
  {
    id: 'ch-comedy-104',
    number: '104',
    name: 'Classic TV Comedy',
    tagline: "Hogan's Heroes & Vintage Sitcoms",
    category: 'Classic TV',
    logoText: 'COMEDY',
    accentColor: '#ff6347',
    logoUrl: '/assets/logos/comedy.png',
    shows: [
      createShow('show-5', "Hogan's Heroes", 'Comedy', [
        createEpisode('ep-7', "Hogan's Heroes Block", 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', 1800000),
      ]),
    ],
  },
];
