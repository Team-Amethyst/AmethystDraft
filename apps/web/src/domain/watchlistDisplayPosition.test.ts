import { describe, expect, it } from "vitest";
import { watchlistPrimaryPositionToken } from "./watchlistDisplayPosition";

describe("watchlistPrimaryPositionToken", () => {
  it("takes first segment before slash or comma", () => {
    expect(watchlistPrimaryPositionToken("SS/2B")).toBe("SS");
    expect(watchlistPrimaryPositionToken("OF, UTIL")).toBe("OF");
  });

  it("defaults empty to UTIL", () => {
    expect(watchlistPrimaryPositionToken("")).toBe("UTIL");
  });
});
