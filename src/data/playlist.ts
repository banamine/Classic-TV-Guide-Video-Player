/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Channel } from '../types';

export const CHANNELS_DATA: Channel[] = [
  {
    id: 'ch-westerns',
    number: '101',
    name: 'Classic Westerns HD',
    tagline: 'High-noon showdowns and frontier justice.',
    category: 'TV Shows',
    logoText: 'WSTN',
    accentColor: '#d97706', // Amber
    shows: [
      {
        id: 'have-gun-will-travel',
        title: 'Have Gun – Will Travel',
        description: 'The adventures of Paladin, a gentleman gunfighter-for-hire living in San Francisco.',
        year: '1957',
        genre: 'Western',
        episodes: [
          {
            id: 'hg-01',
            title: 'Three Bells To Perdido',
            season: '1',
            episodeNumber: '1',
            url: 'https://archive.org/download/s-01.-e-17-ella-west.ia/S01.E01%20Three%20Bells%20To%20Predido.ia.mp4'
          },
          {
            id: 'hg-02',
            title: 'The Outlaw',
            season: '1',
            episodeNumber: '2',
            url: 'https://archive.org/download/s-01.-e-17-ella-west.ia/S01.E02%20The%20Outlaw.ia.mp4'
          },
          {
            id: 'hg-03',
            title: 'The Great Mojave Chase',
            season: '1',
            episodeNumber: '3',
            url: 'https://archive.org/download/s-01.-e-17-ella-west.ia/S01.E03%20The%20Great%20Mojave%20Chase.ia.mp4'
          },
          {
            id: 'hg-04',
            title: 'Winchester Quarantine',
            season: '1',
            episodeNumber: '4',
            url: 'https://archive.org/download/s-01.-e-17-ella-west.ia/S01.E04%20Winchester%20Quarantine.ia.mp4'
          },
          {
            id: 'hg-05',
            title: 'A Matter Of Ethics',
            season: '1',
            episodeNumber: '5',
            url: 'https://archive.org/download/s-01.-e-17-ella-west.ia/S01.E05%20A%20Matter%20Of%20Ethics.ia.mp4'
          },
          {
            id: 'hg-06',
            title: 'The Bride',
            season: '1',
            episodeNumber: '6',
            url: 'https://archive.org/download/s-01.-e-17-ella-west.ia/S01.E06%20The%20Bride.ia.mp4'
          },
          {
            id: 'hg-17',
            title: 'Ella West',
            season: '1',
            episodeNumber: '17',
            url: 'https://archive.org/download/s-01.-e-17-ella-west.ia/S01.E17%20Ella%20West.ia.mp4'
          }
        ]
      },
      {
        id: 'wanted-dead-or-alive',
        title: 'Wanted: Dead or Alive',
        description: 'Josh Randall is a sympathetic bounty hunter who gives a part of his bounty to his clients.',
        year: '1958',
        genre: 'Western',
        episodes: [
          {
            id: 'wda-01',
            title: 'The Martin Poster',
            season: '1',
            episodeNumber: '1',
            url: 'https://archive.org/download/wanted-dead-or-alive-s-01-e-01-ep-1-the-martin-poster/Wanted_%20Dead%20or%20Alive_S01E01_Ep%201%20-%20The%20Martin%20Poster.mp4'
          },
          {
            id: 'wda-02',
            title: 'Fatal Memory',
            season: '1',
            episodeNumber: '2',
            url: 'https://archive.org/download/wanted-dead-or-alive-s-01-e-01-ep-1-the-martin-poster/Wanted_%20Dead%20or%20Alive_S01E02_Ep%202%20-%20Fatal%20Memory.mp4'
          },
          {
            id: 'wda-03',
            title: 'The Bounty',
            season: '1',
            episodeNumber: '3',
            url: 'https://archive.org/download/wanted-dead-or-alive-s-01-e-01-ep-1-the-martin-poster/Wanted_%20Dead%20or%20Alive_S01E03_Ep%203%20-%20The%20Bounty.mp4'
          },
          {
            id: 'wda-04',
            title: 'Dead End',
            season: '1',
            episodeNumber: '4',
            url: 'https://archive.org/download/wanted-dead-or-alive-s-01-e-01-ep-1-the-martin-poster/Wanted_%20Dead%20or%20Alive_S01E04_Ep%204%20-%20Dead%20End.mp4'
          }
        ]
      }
    ]
  },
  {
    id: 'ch-retro-adventure',
    number: '102',
    name: 'Classic Cinema & Movies',
    tagline: 'Feature-length dramas and historic epics.',
    category: 'Movies',
    logoText: 'FILM',
    accentColor: '#9333ea', // Purple
    shows: [
      {
        id: 'maverick',
        title: 'Maverick',
        description: 'The high-stakes poker escapades of the Maverick brothers in the wild West.',
        year: '1957',
        genre: 'Comedy-Western',
        episodes: [
          {
            id: 'mav-01',
            title: 'The Day They Hanged Bret Maverick',
            season: '2',
            episodeNumber: '1',
            url: 'https://archive.org/download/s-01e-02.-point-blank/Maverick%20S02e01%20-%20The%20Day%20They%20Hanged%20Bret%20Maverick.mp4'
          },
          {
            id: 'mav-02',
            title: 'Lonesome Reunion',
            season: '2',
            episodeNumber: '2',
            url: 'https://archive.org/download/s-01e-02.-point-blank/Maverick%20S02e02%20-%20Lonesome%20Reunion.mp4'
          },
          {
            id: 'mav-03',
            title: 'Alias Bret Maverick',
            season: '2',
            episodeNumber: '3',
            url: 'https://archive.org/download/s-01e-02.-point-blank/Maverick%20S02e03%20-%20Alias%20Bret%20Maverick.mp4'
          }
        ]
      },
      {
        id: 'bat-masterson',
        title: 'Bat Masterson',
        description: 'Bat Masterson is a dandy gentleman with a gold-headed cane and an eye for law and order.',
        year: '1958',
        genre: 'Western',
        episodes: [
          {
            id: 'bm-01',
            title: 'Double Showdown',
            season: '1',
            episodeNumber: '1',
            url: 'https://archive.org/download/bat-masterson-s-02-e-07-dead-men-dont-pay-debts/Bat%20Masterson%20S01E01%20Double%20Showdown%201.ia.mp4'
          },
          {
            id: 'bm-02',
            title: 'Two Graves For Swan Valley',
            season: '1',
            episodeNumber: '2',
            url: 'https://archive.org/download/bat-masterson-s-02-e-07-dead-men-dont-pay-debts/Bat%20Masterson%20S01E02%20Two%20Graves%20for%20Swan%20Valley%201.ia.mp4'
          },
          {
            id: 'bm-03',
            title: 'Dynamite Blows Two Ways',
            season: '1',
            episodeNumber: '3',
            url: 'https://archive.org/download/bat-masterson-s-02-e-07-dead-men-dont-pay-debts/Bat%20Masterson%20S01E03%20Dynamite%20Blows%20Two%20Ways%201.ia.mp4'
          }
        ]
      },
      {
        id: 'branded',
        title: 'Branded',
        description: 'An army officer is falsely accused of cowardice and travels the West seeking to clear his name.',
        year: '1965',
        genre: 'Western',
        episodes: [
          {
            id: 'bra-01',
            title: 'A Proud Town',
            season: '2',
            episodeNumber: '15',
            url: 'https://archive.org/download/branded-s-02-e-22-barbed-wire_202405/Branded%20S02E15%20A%20Proud%20Town.mp4'
          },
          {
            id: 'bra-02',
            title: 'Cowards Die Many Times',
            season: '2',
            episodeNumber: '31',
            url: 'https://archive.org/download/branded-s-02-e-22-barbed-wire_202405/Branded%20S02E31%20Cowards%20Die%20Many%20Times.mp4'
          },
          {
            id: 'bra-03',
            title: 'Barbed Wire',
            season: '2',
            episodeNumber: '22',
            url: 'https://archive.org/download/branded-s-02-e-22-barbed-wire_202405/Branded%20S02E22%20Barbed%20Wire.mp4'
          }
        ]
      }
    ]
  },
  {
    id: 'ch-retro-sports',
    number: '103',
    name: 'Retro Action & Trails',
    tagline: 'High stakes cattle drives and dusty trails.',
    category: 'Sports',
    logoText: 'CAMP',
    accentColor: '#16a34a', // Green
    shows: [
      {
        id: 'rawhide',
        title: 'Rawhide',
        description: 'The challenges faced by the drovers of a cattle drive on the Sedalia Trail.',
        year: '1959',
        genre: 'Adventure',
        episodes: [
          {
            id: 'raw-01',
            title: 'Incident Of The Tumbleweed',
            season: '1',
            episodeNumber: '1',
            url: 'https://archive.org/download/rawhide-3-x-30-incident-of-the-wager-on-payday/Rawhide%20-%201X01%20-%20Incident%20Of%20The%20Tumbleweed.mp4'
          },
          {
            id: 'raw-02',
            title: 'Incident At Alabaster Plain',
            season: '1',
            episodeNumber: '2',
            url: 'https://archive.org/download/rawhide-3-x-30-incident-of-the-wager-on-payday/Rawhide%20-%201X02%20-%20Incident%20At%20Alabaster%20Plain.mp4'
          },
          {
            id: 'raw-03',
            title: 'Incident With An Executioner',
            season: '1',
            episodeNumber: '3',
            url: 'https://archive.org/download/rawhide-3-x-30-incident-of-the-wager-on-payday/Rawhide%20-%201X03%20-%20Incident%20With%20An%20Executioner.mp4'
          }
        ]
      },
      {
        id: 'wagon-train',
        title: 'Wagon Train',
        description: 'Following a caravan of pioneers as they make the grueling trek across the plains.',
        year: '1957',
        genre: 'Adventure',
        episodes: [
          {
            id: 'wt-01',
            title: 'The Willy Moran Story',
            season: '1',
            episodeNumber: '101',
            url: 'https://archive.org/download/wagon-train-s-01-e-101-ep-101-the-willy-moran-story/Wagon%20Train_S01E101_Ep%20101%20-%20The%20Willy%20Moran%20Story.ia.mp4'
          },
          {
            id: 'wt-02',
            title: 'The Jean Lebec Story',
            season: '1',
            episodeNumber: '102',
            url: 'https://archive.org/download/wagon-train-s-01-e-101-ep-101-the-willy-moran-story/Wagon%20Train_S01E102_Ep%20102%20-%20The%20Jean%20Lebec%20Story.ia.mp4'
          },
          {
            id: 'wt-03',
            title: 'The John Cameron Story',
            season: '1',
            episodeNumber: '103',
            url: 'https://archive.org/download/wagon-train-s-01-e-101-ep-101-the-willy-moran-story/Wagon%20Train_S01E103_Ep%20103%20-%20The%20John%20Cameron%20Story.ia.mp4'
          }
        ]
      }
    ]
  },
  {
    id: 'ch-retro-news',
    number: '104',
    name: 'Naked City Crime Journal',
    tagline: 'The grit, the truth, and the lenses of metropolitan squad rooms.',
    category: 'News',
    logoText: 'CITY',
    accentColor: '#2563eb', // Blue
    shows: [
      {
        id: 'naked-city',
        title: 'Naked City',
        description: 'Gritty police procedurals tracking the stories and crimes of the vast New York metropolis.',
        year: '1958',
        genre: 'Crime-Drama',
        episodes: [
          {
            id: 'nc-01',
            title: 'Meridian',
            season: '1',
            episodeNumber: '1',
            url: 'https://archive.org/download/naked-city-s-01-e-01-meridian/Naked%20City%20S01E01%20Meridian.mp4'
          },
          {
            id: 'nc-02',
            title: 'Nickel Ride',
            season: '1',
            episodeNumber: '2',
            url: 'https://archive.org/download/naked-city-s-01-e-01-meridian/Naked%20City%20S01E02%20Nickel%20Ride.mp4'
          },
          {
            id: 'nc-03',
            title: 'Line Of Duty',
            season: '1',
            episodeNumber: '3',
            url: 'https://archive.org/download/naked-city-s-01-e-01-meridian/Naked%20City%20S01E03%20Line%20of%20Duty.mp4'
          }
        ]
      },
      {
        id: 'man-with-a-camera',
        title: 'Man with a Camera',
        description: 'Charles Bronson stars as Mike Kovac, a freelance photojournalist helping solve city cases.',
        year: '1958',
        genre: 'Mystery',
        episodes: [
          {
            id: 'mwc-01',
            title: 'Second Avenue Assassin',
            season: '1',
            episodeNumber: '1',
            url: 'https://archive.org/download/man-with-a-camera-s-01-e-04-turntable/Man%20with%20a%20Camera_S01E01_Second%20Avenue%20Assassin.ia.mp4'
          },
          {
            id: 'mwc-02',
            title: 'The Warning',
            season: '1',
            episodeNumber: '2',
            url: 'https://archive.org/download/man-with-a-camera-s-01-e-04-turntable/Man%20with%20a%20Camera_S01E02_The%20Warning.ia.mp4'
          },
          {
            id: 'mwc-03',
            title: 'Turntable',
            season: '1',
            episodeNumber: '4',
            url: 'https://archive.org/download/man-with-a-camera-s-01-e-04-turntable/Man%20with%20a%20Camera_S01E04_Turntable.ia.mp4'
          }
        ]
      },
      {
        id: 'johnny-staccato',
        title: 'Johnny Staccato',
        description: 'A Greenwich Village jazz pianist doubles as a private investigator in New York.',
        year: '1959',
        genre: 'Noir-Crime',
        episodes: [
          {
            id: 'js-01',
            title: 'Viva, Paco!',
            season: '1',
            episodeNumber: '6',
            url: 'https://archive.org/download/johnny-staccato.-s-01-e-26.-a-nice-little-town/Johnny%20Staccato.S01E06.Viva,%20Paco!.ia.mp4'
          },
          {
            id: 'js-02',
            title: 'Murder In Hi-Fi',
            season: '1',
            episodeNumber: '8',
            url: 'https://archive.org/download/johnny-staccato.-s-01-e-26.-a-nice-little-town/Johnny%20Staccato.S01E08.Murder%20in%20Hi-Fi.ia.mp4'
          }
        ]
      }
    ]
  },
  {
    id: 'ch-retro-kids',
    number: '105',
    name: 'Sci-Fi Dimension & Drama',
    tagline: 'Unlock the gate to a world of endless imagination.',
    category: 'Kids',
    logoText: 'ZONE',
    accentColor: '#db2777', // Rose
    shows: [
      {
        id: 'twilight-zone',
        title: 'The Twilight Zone',
        description: 'Classic stories of mystery, sci-fi, and suspense that challenge reality.',
        year: '1959',
        genre: 'Sci-Fi',
        episodes: [
          {
            id: 'tz-01',
            title: 'Queen Of The Nile',
            season: '5',
            episodeNumber: '24',
            url: 'https://archive.org/download/04-twilight-zone-s-01-e-04-16-millimeter-shrine/137-Twilight%20Zone_S05E24_Queen%20of%20the%20Nile%201.ia.mp4'
          },
          {
            id: 'tz-02',
            title: 'Steel',
            season: '5',
            episodeNumber: '2',
            url: 'https://archive.org/download/04-twilight-zone-s-01-e-04-16-millimeter-shrine/115-Twilight%20Zone_S05E02_Steel%201.ia.mp4'
          },
          {
            id: 'tz-03',
            title: 'Nightmare At 20,000 Feet',
            season: '5',
            episodeNumber: '3',
            url: 'https://archive.org/download/04-twilight-zone-s-01-e-04-16-millimeter-shrine/116-Twilight%20Zone_S05E03_Nightmare%20at%2020,000%20Feet%201.ia.mp4'
          }
        ]
      },
      {
        id: 'gunsmoke',
        title: 'Gunsmoke',
        description: 'Marshall Matt Dillon maintains peace and justice in Dodge City.',
        year: '1955',
        genre: 'Western-Drama',
        episodes: [
          {
            id: 'gs-01',
            title: 'The Noose',
            season: '16',
            episodeNumber: '1',
            url: 'https://archive.org/download/gunsmoke-s-16-e-01-the-noose/Gunsmoke%20S16E01%20(The%20Noose).ia.mp4'
          },
          {
            id: 'gs-02',
            title: 'Chato',
            season: '16',
            episodeNumber: '2',
            url: 'https://archive.org/download/gunsmoke-s-16-e-01-the-noose/Gunsmoke%20S16E02%20(Chato).ia.mp4'
          }
        ]
      }
    ]
  }
];
