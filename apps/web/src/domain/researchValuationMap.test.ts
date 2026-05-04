import { describe, expect, it } from "vitest";
import { researchValuationRowMapFromEngine } from "./researchValuationMap";
import type { ValuationShape } from "../utils/valuation";

describe("researchValuationRowMapFromEngine", () => {
  it("omits custom player ids", () => {
    const rows: ValuationShape[] = [
      { player_id: "a", name: "A" } as ValuationShape,
      { player_id: "custom_x", name: "X" } as ValuationShape,
    ];
    const m = researchValuationRowMapFromEngine(rows, new Set(["custom_x"]));
    expect([...m.keys()].sort()).toEqual(["a"]);
  });
});
