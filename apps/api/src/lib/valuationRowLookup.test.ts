import { describe, expect, it } from "vitest";
import {
  buildCanonicalPlayerIdByNormName,
  findValuationNameCollisions,
  pickCanonicalValuationRowForName,
} from "./valuationRowLookup";

describe("valuationRowLookup", () => {
  const draftable = new Set(["woo_sp", "woo_other"]);

  const vals = [
    { player_id: "woo_sp", name: "Bryan Woo", auction_value: 34.25 },
    { player_id: "woo_other", name: "Bryan Woo", auction_value: 16.7 },
    { player_id: "judge", name: "Aaron Judge", auction_value: 31 },
  ];

  const catalogIdByNorm = new Map([["bryanwoo", "woo_other"]]);

  it("prefers highest draftable auction when catalog id appears more than once", () => {
    const dupVals = [
      { player_id: "693433", name: "Bryan Woo", auction_value: 16 },
      { player_id: "693433", name: "Bryan Woo", auction_value: 31 },
    ];
    const row = pickCanonicalValuationRowForName(
      dupVals,
      new Set(["693433"]),
      "Bryan Woo",
      new Map([["bryanwoo", "693433"]]),
    );
    expect(row?.auction_value).toBe(31);
  });

  it("prefers catalog player_id when provided", () => {
    const row = pickCanonicalValuationRowForName(
      vals,
      draftable,
      "Bryan Woo",
      catalogIdByNorm,
    );
    expect(row?.player_id).toBe("woo_other");
    expect(row?.auction_value).toBe(16.7);
  });

  it("falls back to draftable highest auction_value without catalog id", () => {
    const row = pickCanonicalValuationRowForName(vals, draftable, "Bryan Woo");
    expect(row?.player_id).toBe("woo_sp");
    expect(row?.auction_value).toBe(34.25);
  });

  it("buildCanonicalPlayerIdByNormName uses catalog ids first", () => {
    const map = buildCanonicalPlayerIdByNormName(vals, draftable, catalogIdByNorm);
    expect(map.get("bryanwoo")).toBe("woo_other");
  });

  it("findValuationNameCollisions lists ambiguous names", () => {
    const hits = findValuationNameCollisions(vals, draftable);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.norm_name).toBe("bryanwoo");
    expect(hits[0]?.rows).toHaveLength(2);
  });
});
