import { describe, it, expect } from "vitest";
import { buildWizardPresetFromCheckpointJson } from "./checkpointWizardPreset";

describe("buildWizardPresetFromCheckpointJson", () => {
  it("uses league.team_names from checkpoint fixtures", () => {
    const preset = buildWizardPresetFromCheckpointJson(
      {
        schemaVersion: "1.0.0",
        checkpoint: "pre_draft",
        league: {
          roster_slots: { OF: 1 },
          scoring_categories: [{ name: "HR", type: "batting" }],
          total_budget: 260,
          num_teams: 3,
          league_scope: "Mixed",
          team_names: ["Team A", "Team B", "Team C"],
        },
        draft_state: [],
      },
      "pre_draft",
    );
    expect("error" in preset).toBe(false);
    if ("error" in preset) return;
    expect(preset.teamDisplayNames).toEqual(["Team A", "Team B", "Team C"]);
  });
});
