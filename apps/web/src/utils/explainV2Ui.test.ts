import { describe, expect, it } from "vitest";
import { summarizeDriverReason, truncateExplainText } from "./explainV2Ui";

describe("explainV2Ui", () => {
  it("truncateExplainText respects max", () => {
    expect(truncateExplainText("abcdef", 4)).toBe("abc…");
  });

  it("summarizeDriverReason prefers first semicolon clause", () => {
    const long =
      "League inflation -40; replacement_slots_v2: slot-aware surplus allocation (factor 0.93) on marginal list. " +
      "Additional engine prose so the string exceeds the preview cap and the semicolon branch is exercised reliably.";
    const { preview, full } = summarizeDriverReason(long);
    expect(full).toBe(long.trim());
    expect(preview).toBe("League inflation -40");
    expect(preview.length).toBeLessThan(full.length);
  });
});
