import { describe, it, expect } from "vitest";
import { playerDataToPositionOverrides } from "./engineContext";
import type { PlayerData } from "./playerCatalog";

function minimalPlayer(
  partial: Partial<PlayerData> & Pick<PlayerData, "id">,
): PlayerData {
  return {
    mlbId: Number(partial.id) || 0,
    name: "",
    team: "",
    position: partial.position ?? "OF",
    positions: partial.positions ?? ["OF"],
    age: 0,
    catalog_rank: 0,
    value: 1,
    catalog_tier: 1,
    catalog_kind: "valuation_eligible",
    valuation_eligible: true,
    headshot: "",
    stats: {},
    projection: {},
    outlook: "",
    ...partial,
  } as PlayerData;
}

describe("playerDataToPositionOverrides", () => {
  it("falls back to primary position when positions is empty", () => {
    const out = playerDataToPositionOverrides([
      minimalPlayer({
        id: "660271",
        position: "C",
        positions: [],
      }),
    ]);
    expect(out).toEqual([{ player_id: "660271", positions: ["C"] }]);
  });

  it("uses MLB person id string from catalog id", () => {
    const out = playerDataToPositionOverrides([
      minimalPlayer({
        id: "592450",
        position: "SP",
        positions: ["SP", "RP"],
      }),
    ]);
    expect(out[0]?.player_id).toBe("592450");
    expect(out[0]?.positions).toEqual(["SP", "RP"]);
  });
});
