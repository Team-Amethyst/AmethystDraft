import { describe, it, expect } from "vitest";
import { parseDraftAuctionSalary } from "./checkpointWide2026Draft.mjs";

describe("parseDraftAuctionSalary", () => {
  it("treats blank and zero as missing (not coerced auction salary)", () => {
    expect(parseDraftAuctionSalary("")).toEqual({
      paid: NaN,
      salaryMissing: true,
    });
    expect(parseDraftAuctionSalary(null)).toEqual({
      paid: NaN,
      salaryMissing: true,
    });
    expect(parseDraftAuctionSalary(0)).toEqual({
      paid: NaN,
      salaryMissing: true,
    });
  });

  it("accepts explicit positive numeric salary including 0 from workbook only when > 0", () => {
    expect(parseDraftAuctionSalary(25)).toEqual({
      paid: 25,
      salaryMissing: false,
    });
    expect(parseDraftAuctionSalary("42")).toEqual({
      paid: 42,
      salaryMissing: false,
    });
  });
});
