import type { Player } from "../types/player";

export const PLAYER_DATABASE: Player[] = [
  {
    id: '1',
    name: 'Ronald Acuña Jr.',
    team: 'ATL',
    position: 'OF',
    age: 26,
    adp: 1.2,
    tier: 1,
    value: 98,
    outlook: 'Elite five-tool player with 40/70 potential. Leadoff spot maximizes counting stats. Unanimous first-round pick.',
    stats: {
      batting: {
        avg: '.337',
        hr: 41,
        rbi: 106,
        runs: 149,
        sb: 73,
        obp: '.416',
        slg: '.596'
      }
    },
    projection: {
      batting: {
        avg: '.295',
        hr: 42,
        rbi: 110,
        runs: 125,
        sb: 65
      }
    }
  },
  {
    id: '2',
    name: 'Shohei Ohtani',
    team: 'LAD',
    position: 'DH',
    age: 29,
    adp: 2.5,
    tier: 1,
    value: 99,
    outlook: 'Hitting only in 2026 but still elite power/speed combo. Dodgers lineup boosts counting stats significantly.',
    stats: {
      batting: {
        avg: '.304',
        hr: 44,
        rbi: 95,
        runs: 103,
        sb: 20,
        obp: '.390',
        slg: '.654'
      }
    },
    projection: {
      batting: {
        avg: '.285',
        hr: 50,
        rbi: 125,
        runs: 110,
        sb: 22
      }
    }
  },
  {
    id: '3',
    name: 'Bobby Witt Jr.',
    team: 'KC',
    position: 'SS',
    age: 24,
    adp: 4.1,
    tier: 1,
    value: 95,
    outlook: 'Emerging superstar with 30/30 upside. Premium position eligibility adds massive value. Building block for dynasty.',
    stats: {
      batting: {
        avg: '.276',
        hr: 30,
        rbi: 96,
        runs: 122,
        sb: 49,
        obp: '.319',
        slg: '.495'
      }
    },
    projection: {
      batting: {
        avg: '.285',
        hr: 32,
        rbi: 105,
        runs: 115,
        sb: 45
      }
    }
  },
  {
    id: '4',
    name: 'Julio Rodríguez',
    team: 'SEA',
    position: 'OF',
    age: 23,
    adp: 3.8,
    tier: 1,
    value: 96,
    outlook: 'Young star with elite tools across the board. 30/30 potential in a solid Mariners lineup. Sky-high ceiling.',
    stats: {
      batting: {
        avg: '.275',
        hr: 32,
        rbi: 103,
        runs: 111,
        sb: 37,
        obp: '.331',
        slg: '.508'
      }
    },
    projection: {
      batting: {
        avg: '.280',
        hr: 35,
        rbi: 108,
        runs: 105,
        sb: 35
      }
    }
  },
  {
    id: '5',
    name: 'Spencer Strider',
    team: 'ATL',
    position: 'SP',
    age: 25,
    adp: 18.5,
    tier: 2,
    value: 96,
    outlook: 'Elite strikeout upside with ACE ceiling. Fully healthy after 2025 injury. Top-5 pitcher when on the mound.',
    stats: {
      pitching: {
        era: '3.86',
        whip: '1.10',
        wins: 10,
        saves: 0,
        strikeouts: 186,
        innings: '131.2'
      }
    },
    projection: {
      pitching: {
        era: '2.95',
        whip: '1.02',
        wins: 15,
        saves: 0,
        strikeouts: 245
      }
    }
  },
  {
    id: '6',
    name: 'Gerrit Cole',
    team: 'NYY',
    position: 'SP',
    age: 33,
    adp: 22.1,
    tier: 2,
    value: 94,
    outlook: 'Perennial ACE with elite strikeouts and ratios. Some injury concern but top-10 pitcher upside when healthy.',
    stats: {
      pitching: {
        era: '3.41',
        whip: '1.13',
        wins: 8,
        saves: 0,
        strikeouts: 209,
        innings: '209.0'
      }
    },
    projection: {
      pitching: {
        era: '3.15',
        whip: '1.08',
        wins: 14,
        saves: 0,
        strikeouts: 215
      }
    }
  },
  {
    id: '7',
    name: 'Adley Rutschman',
    team: 'BAL',
    position: 'C',
    age: 26,
    adp: 35.2,
    tier: 3,
    value: 90,
    outlook: 'Clear C1 in elite Orioles lineup. Rare power/average combo at premium position. Set-and-forget backstop.',
    stats: {
      batting: {
        avg: '.277',
        hr: 20,
        rbi: 80,
        runs: 78,
        sb: 3,
        obp: '.362',
        slg: '.440'
      }
    },
    projection: {
      batting: {
        avg: '.275',
        hr: 22,
        rbi: 85,
        runs: 85,
        sb: 4
      }
    }
  },
  {
    id: '8',
    name: 'Mookie Betts',
    team: 'LAD',
    position: '2B',
    age: 31,
    adp: 6.2,
    tier: 1,
    value: 97,
    outlook: 'Multi-category stud with 2B/SS eligibility. Dodgers lineup ensures elite counting stats. Consistent producer.',
    stats: {
      batting: {
        avg: '.307',
        hr: 19,
        rbi: 75,
        runs: 107,
        sb: 16,
        obp: '.372',
        slg: '.491'
      }
    },
    projection: {
      batting: {
        avg: '.290',
        hr: 28,
        rbi: 95,
        runs: 115,
        sb: 18
      }
    }
  },
  {
    id: '9',
    name: 'Jose Ramirez',
    team: 'CLE',
    position: '3B',
    age: 31,
    adp: 10.1,
    tier: 2,
    value: 92,
    outlook: 'Consistent 30/20 threat at premium position. Elite floor with perennial All-Star upside. Safe top-10 pick.',
    stats: {
      batting: {
        avg: '.280',
        hr: 39,
        rbi: 118,
        runs: 114,
        sb: 20,
        obp: '.355',
        slg: '.548'
      }
    },
    projection: {
      batting: {
        avg: '.275',
        hr: 32,
        rbi: 105,
        runs: 100,
        sb: 22
      }
    }
  },
  {
    id: '10',
    name: 'Freddie Freeman',
    team: 'LAD',
    position: '1B',
    age: 34,
    adp: 7.0,
    tier: 1,
    value: 93,
    outlook: 'Batting average anchor with 25+ HR power. Dodgers lineup protection maximizes RBI potential.',
    stats: {
      batting: {
        avg: '.331',
        hr: 29,
        rbi: 102,
        runs: 106,
        sb: 8,
        obp: '.410',
        slg: '.567'
      }
    },
    projection: {
      batting: {
        avg: '.305',
        hr: 27,
        rbi: 108,
        runs: 105,
        sb: 6
      }
    }
  },
  {
    id: '11',
    name: 'Wyatt Langford',
    team: 'TEX',
    position: 'OF',
    age: 22,
    adp: 85,
    tier: 3,
    value: 82,
    outlook: 'Top prospect with 25/20 upside. Rangers championship lineup gives him instant support. Breakout candidate.',
    stats: {
      batting: {
        avg: '.253',
        hr: 4,
        rbi: 20,
        runs: 16,
        sb: 3,
        obp: '.328',
        slg: '.399'
      }
    },
    projection: {
      batting: {
        avg: '.275',
        hr: 26,
        rbi: 85,
        runs: 88,
        sb: 22
      }
    }
  },
  {
    id: '12',
    name: 'Juan Soto',
    team: 'NYY',
    position: 'OF',
    age: 25,
    adp: 12.3,
    tier: 2,
    value: 95,
    outlook: 'Elite plate discipline with elite power. Yankees lineup shift could boost counting stats. Top-15 lock.',
    stats: {
      batting: {
        avg: '.275',
        hr: 35,
        rbi: 109,
        runs: 111,
        sb: 7,
        obp: '.410',
        slg: '.519'
      }
    },
    projection: {
      batting: {
        avg: '.280',
        hr: 38,
        rbi: 115,
        runs: 108,
        sb: 8
      }
    }
  },
  {
    id: '13',
    name: 'Fernando Tatis Jr.',
    team: 'SD',
    position: 'OF',
    age: 25,
    adp: 9.2,
    tier: 1,
    value: 95,
    outlook: 'Electric talent with 40/30 ceiling when healthy. Injury history is only concern. High-risk, high-reward.',
    stats: {
      batting: {
        avg: '.276',
        hr: 21,
        rbi: 73,
        runs: 69,
        sb: 16,
        obp: '.354',
        slg: '.469'
      }
    },
    projection: {
      batting: {
        avg: '.285',
        hr: 38,
        rbi: 105,
        runs: 98,
        sb: 28
      }
    }
  },
  {
    id: '14',
    name: 'Jackson Holliday',
    team: 'BAL',
    position: '2B',
    age: 20,
    adp: 92,
    tier: 3,
    value: 80,
    outlook: 'Elite prospect ready for full season. Contact skills and speed play immediately. Orioles lineup boost.',
    stats: {
      batting: {
        avg: '.189',
        hr: 5,
        rbi: 23,
        runs: 28,
        sb: 4,
        obp: '.253',
        slg: '.311'
      }
    },
    projection: {
      batting: {
        avg: '.265',
        hr: 18,
        rbi: 75,
        runs: 88,
        sb: 24
      }
    }
  },
  {
    id: '15',
    name: 'Elly De La Cruz',
    team: 'CIN',
    position: 'SS',
    age: 22,
    adp: 16.4,
    tier: 2,
    value: 93,
    outlook: 'Generational speed with developing power. 25/70 potential is league-winning. Sky-high ceiling.',
    stats: {
      batting: {
        avg: '.258',
        hr: 25,
        rbi: 76,
        runs: 105,
        sb: 67,
        obp: '.331',
        slg: '.478'
      }
    },
    projection: {
      batting: {
        avg: '.265',
        hr: 28,
        rbi: 82,
        runs: 110,
        sb: 70
      }
    }
  },
];
