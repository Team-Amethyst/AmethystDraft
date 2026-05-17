import { describe, it, expect } from "vitest";
import { planMockDraftFromCheckpointJson } from "./checkpointMockDraft";
import type { Player } from "../types/player";

const minimalPlayers: Player[] = [
  {
    id: "660001",
    mlbId: 660001,
    name: "Sample Player 1",
    team: "NYY",
    position: "OF",
    positions: ["OF"],
    age: 28,
    catalog_rank: 1,
    catalog_tier: 1,
    value: 40,
    headshot: "",
    outlook: "",
    stats: {},
    projection: {},
  },
];

describe("planMockDraftFromCheckpointJson", () => {
  it("hydrates nested Activity #9 picks-through-N vs pre_draft baseline", () => {
    const pre = planMockDraftFromCheckpointJson({
      checkpointKey: "pre_draft",
      checkpointJson: {
        checkpoint: "pre_draft",
        league: {
          roster_slots: { OF: 1, UTIL: 1 },
          scoring_categories: [{ name: "HR", type: "batting" }],
          total_budget: 100,
          num_teams: 2,
          league_scope: "Mixed",
        },
        draft_state: [],
      },
      leagueTeamNames: ["You", "AI"],
      allPlayers: minimalPlayers,
    });
    expect("error" in pre).toBe(false);
    if ("error" in pre) return;
    expect(pre.mockDraftState.log).toHaveLength(0);

    const step10 = planMockDraftFromCheckpointJson({
      checkpointKey: "after_pick_10",
      checkpointJson: {
        checkpoint: "after_pick_10",
        league: {
          roster_slots: { OF: 1, UTIL: 1 },
          scoring_categories: [{ name: "HR", type: "batting" }],
          total_budget: 100,
          num_teams: 2,
          league_scope: "Mixed",
        },
        draft_state: [
          {
            player_id: "660001",
            name: "Sample Player 1",
            positions: ["OF"],
            team: "NYY",
            team_id: "team_2",
            paid: 6,
            pick_number: 1,
            roster_slot: "OF1",
          },
        ],
      },
      leagueTeamNames: ["You", "AI"],
      allPlayers: minimalPlayers,
    });
    expect("error" in step10).toBe(false);
    if ("error" in step10) return;
    expect(step10.mockDraftState.log).toHaveLength(1);
    expect(step10.mockDraftState.checkpointHydration?.checkpointKey).toBe(
      "after_pick_10",
    );
    expect(step10.mockDraftState.rosters.find((r) => !r.isUser)?.picks.length).toBe(
      1,
    );
    expect(step10.mockDraftState.undraftedPlayers.map((p) => p.id)).toEqual([]);
  });
});
