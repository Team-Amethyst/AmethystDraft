import { describe, expect, it } from "vitest";
import { researchPlayerCellTooltip } from "./researchPlayerCellTooltip";

describe("researchPlayerCellTooltip", () => {
  it("returns undefined when there are no meta lines", () => {
    expect(
      researchPlayerCellTooltip({
        playerName: "A",
        tags: [],
        isCustom: false,
        maskEngineColumns: true,
        researchDraftable: "draftable",
      }),
    ).toBeUndefined();
  });

  it("includes tags and custom flag", () => {
    const t = researchPlayerCellTooltip({
      playerName: "B",
      tags: ["HR", "SB"],
      isCustom: true,
      maskEngineColumns: true,
    });
    expect(t).toContain("B");
    expect(t).toContain("Custom player");
    expect(t).toContain("Category tags: HR · SB");
  });

  it("omits outside-pool hint while board columns are masked", () => {
    const masked = researchPlayerCellTooltip({
      playerName: "C",
      tags: [],
      isCustom: false,
      maskEngineColumns: true,
      researchDraftable: "outside",
    });
    expect(masked).toBeUndefined();

    const unmasked = researchPlayerCellTooltip({
      playerName: "C",
      tags: [],
      isCustom: false,
      maskEngineColumns: false,
      researchDraftable: "outside",
    });
    expect(unmasked).toContain("Outside the Engine draftable pool");
  });
});
