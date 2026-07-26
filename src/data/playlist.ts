import { Channel } from '../types';

export const CHANNELS_DATA: Channel[] = [
  {
    id: 'ch-classic-western',
    number: '101',
    name: 'Classic Westerns',
    logo: '/assets/logos/western.png',
    playlistUrl: '/playlists/westerns.m3u',
    category: 'Classic TV'
  },
  {
    id: 'ch-classic-detective',
    number: '102',
    name: 'Classic Detectives',
    logo: '/assets/logos/detective.png',
    playlistUrl: '/playlists/detectives.m3u',
    category: 'Classic TV'
  },
  {
    id: 'ch-classic-sitcoms',
    number: '103',
    name: 'Classic Sitcoms',
    logo: '/assets/logos/sitcoms.png',
    playlistUrl: '/playlists/sitcoms.m3u',
    category: 'Classic TV'
  }
];
