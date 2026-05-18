import { describe, expect, it } from "vitest";
import {
  DEPTH_CHART_DETAILS_NOTE,
  DEPTH_CHART_PAGE_SUBTITLE,
} from "./depthChartPageCopy";

describe("depthChartPageCopy", () => {
  it("discloses fantasy-oriented synthesis in subtitle and details note", () => {
    expect(DEPTH_CHART_PAGE_SUBTITLE).toContain("Fantasy-oriented");
    expect(DEPTH_CHART_PAGE_SUBTITLE).toContain("active roster");
    expect(DEPTH_CHART_DETAILS_NOTE).toContain("multiple positions");
    expect(DEPTH_CHART_DETAILS_NOTE).toContain("SP and RP");
    expect(DEPTH_CHART_DETAILS_NOTE).toContain("generic P");
  });
});
