import { describe, expect, it } from "vitest";
import type { Player } from "../types/player";
import {
  formatTierAvailabilitySummary,
  isTierDepleted,
} from "./tiers";

function player(id: string): Player {
  return {
    id,
    mlbId: 1,
    name: id,
    team: "SEA",
    position: "OF",
    age: 28,
    catalog_rank: 1,
    catalog_tier: 1,
    value: 1,
    headshot: "",
    stats: {},
  } as Player;
}

describe("tier availability summary", () => {
  it("marks tier depleted when 0 available", () => {
    const stat = {
      availableCount: 0,
      draftedCount: 18,
      players: Array.from({ length: 18 }, (_, i) => player(`d${i}`)),
    };
    expect(isTierDepleted(stat)).toBe(true);
    expect(formatTierAvailabilitySummary(stat).primary).toBe(
      "Depleted · 18 drafted",
    );
    expect(formatTierAvailabilitySummary(stat).title).toBe("18 players in tier");
  });

  it("shows available first without total in primary line", () => {
    const stat = {
      availableCount: 4,
      draftedCount: 18,
      players: Array.from({ length: 22 }, (_, i) => player(`p${i}`)),
    };
    expect(formatTierAvailabilitySummary(stat).primary).toBe(
      "4 left · 18 drafted",
    );
    expect(formatTierAvailabilitySummary(stat).title).toBe("22 players in tier");
  });
});
