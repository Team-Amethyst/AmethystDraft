import { describe, expect, it } from "vitest";
import { rotoCategoryAggregation } from "./standings";

describe("rotoCategoryAggregation", () => {
  it("treats ERA as lower-is-better for pitching", () => {
    expect(rotoCategoryAggregation("Earned Run Average (ERA)", "pitching")).toBe(
      "lower",
    );
  });

  it("treats HR as sum for batting", () => {
    expect(rotoCategoryAggregation("Home Runs (HR)", "batting")).toBe("sum");
  });
});
