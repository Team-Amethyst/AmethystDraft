import { describe, expect, it } from "vitest";
import {
  researchTableNumericCell,
  researchTableTextCell,
} from "./researchPlayerTableLayout";

describe("researchPlayerTableLayout empty cells", () => {
  it("returns null for missing numeric values", () => {
    expect(researchTableNumericCell(undefined)).toBeNull();
    expect(researchTableNumericCell(Number.NaN)).toBeNull();
    expect(researchTableNumericCell(12)).toBe(12);
  });

  it("returns null for dash placeholders in text cells", () => {
    expect(researchTableTextCell("-")).toBeNull();
    expect(researchTableTextCell("—")).toBeNull();
    expect(researchTableTextCell(".312")).toBe(".312");
  });
});
