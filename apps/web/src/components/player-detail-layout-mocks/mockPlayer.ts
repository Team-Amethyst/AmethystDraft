import type { Player } from "../../types/player";

const MOCK_HEADSHOT_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <rect width="128" height="128" fill="#141022"/>
    <circle cx="64" cy="52" r="22" fill="#2a2438" stroke="rgba(139,92,246,0.35)" stroke-width="2"/>
    <rect x="36" y="82" width="56" height="28" rx="6" fill="#2a2438" stroke="rgba(139,92,246,0.2)"/>
  </svg>`,
);

/**
 * Static player payload for layout mockups only (not used in production flows).
 */
export const MOCK_PLAYER_FOR_LAYOUTS: Player = {
  id: "layout-mock-player",
  mlbId: 660271,
  name: "Shohei Ohtani",
  team: "LAD",
  position: "DH",
  positions: ["DH", "SP"],
  age: 30,
  adp: 3,
  value: 52,
  tier: 1,
  baseline_value: 48,
  auction_value: 45,
  adjusted_value: 45,
  recommended_bid: 52,
  team_adjusted_value: 42,
  edge: -10,
  indicator: "Reach",
  headshot: `data:image/svg+xml,${MOCK_HEADSHOT_SVG}`,
  stats: {
    batting: {
      avg: ".286",
      hr: 54,
      rbi: 130,
      runs: 118,
      sb: 21,
      obp: ".372",
      slg: ".649",
    },
    pitching: {
      era: "3.14",
      whip: "1.06",
      wins: 10,
      saves: 0,
      holds: 0,
      strikeouts: 132,
      innings: "109.0",
      completeGames: 0,
    },
  },
  projection: {
    batting: {
      avg: ".278",
      hr: 42,
      rbi: 108,
      runs: 102,
      sb: 18,
    },
    pitching: {
      era: "3.35",
      whip: "1.10",
      wins: 11,
      saves: 0,
      holds: 0,
      strikeouts: 128,
      completeGames: 0,
      innings: 105,
    },
  },
  stats3yr: {
    batting: {
      avg: ".274",
      hr: 44,
      rbi: 102,
      runs: 98,
      sb: 17,
      obp: ".365",
      slg: ".598",
    },
    pitching: {
      era: "3.42",
      whip: "1.12",
      wins: 9,
      saves: 0,
      holds: 0,
      strikeouts: 118,
      completeGames: 0,
      innings: 95,
    },
  },
  outlook:
    "Two-way workload remains elite; monitor innings ramp on the mound while DH production stays top-tier.",
  injuryStatus: undefined,
  why: ["Dual-role scarcity keeps the price floor high.", "Pitching volume slightly capped vs peak seasons."],
  market_notes: ["Early ADP riser in NFBC drafts this month."],
  valuation_explain: {
    effective_positions: ["DH", "SP"],
    replacement_key_used: "DH / SP blend",
    replacement_value_used: 18,
    surplus_basis: "Roster-adjusted replacement",
    inflation_factor: 1.08,
    pool_to_slot_ratio: 1.12,
  },
  recommended_bid_note: "Anchor bid assumes you need either bat or arm slot filled first.",
  edge_note: "Edge vs max reflects roster-specific team value vs recommended cap.",
  explain_v2: {
    indicator: "Reach",
    auction_target: 52,
    list_value: 45,
    adjustments: { scarcity: 4, inflation: 2, other: 1 },
    drivers: [
      { label: "Scarcity", impact: 3, reason: "Two-way roster flexibility is rare." },
      { label: "Injury / workload", impact: -2, reason: "Pitching innings monitored." },
    ],
    confidence: 0.78,
  },
};
