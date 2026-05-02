import { describe, expect, it } from "vitest";
import { normalizeCatName } from "./categories";

describe("normalizeCatName", () => {
  it("extracts abbreviation from trailing parentheses", () => {
    expect(normalizeCatName("Walks + Hits per IP (WHIP)")).toBe("WHIP");
    expect(normalizeCatName("Runs (R)")).toBe("R");
  });

  it("returns full string when no parentheses suffix", () => {
    expect(normalizeCatName("Home Runs")).toBe("Home Runs");
    expect(normalizeCatName("ERA")).toBe("ERA");
  });
});
