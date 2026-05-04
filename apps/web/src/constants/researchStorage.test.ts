import { describe, expect, it } from "vitest";
import { RESEARCH_POSITION_FILTER_STORAGE_KEY } from "./researchStorage";

describe("RESEARCH_POSITION_FILTER_STORAGE_KEY", () => {
  it("is stable for persisted Research filter", () => {
    expect(RESEARCH_POSITION_FILTER_STORAGE_KEY).toBe(
      "amethyst-research-position",
    );
  });
});
