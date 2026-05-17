import { describe, expect, it } from "vitest";
import { RESEARCH_ENGINE_POOL_FILTER_LABELS } from "../domain/draftablePoolSemantics";

describe("Research engine pool filter labels", () => {
  it("does not use Draftable or Replacement wording", () => {
    expect(RESEARCH_ENGINE_POOL_FILTER_LABELS.all).toBe("All players");
    expect(RESEARCH_ENGINE_POOL_FILTER_LABELS.inEnginePool).toBe("In engine pool");
    expect(RESEARCH_ENGINE_POOL_FILTER_LABELS.outsideEnginePool).toBe(
      "Outside engine pool",
    );
    expect(RESEARCH_ENGINE_POOL_FILTER_LABELS.inEnginePool).not.toMatch(
      /draftable/i,
    );
    expect(RESEARCH_ENGINE_POOL_FILTER_LABELS.outsideEnginePool).not.toMatch(
      /replacement/i,
    );
  });
});
