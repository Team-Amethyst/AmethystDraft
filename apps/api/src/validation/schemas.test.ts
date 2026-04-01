import { describe, expect, it } from "vitest";
import { mockPickSchema, newsSignalsQuerySchema } from "./schemas";

describe("mockPickSchema", () => {
  it("accepts valid payload and defaults budgetByTeamId", () => {
    const parsed = mockPickSchema.parse({
      availablePlayerIds: ["123", "456"],
    });

    expect(parsed.budgetByTeamId).toEqual({});
    expect(parsed.availablePlayerIds).toEqual(["123", "456"]);
  });

  it("rejects negative budgets", () => {
    const result = mockPickSchema.safeParse({
      budgetByTeamId: { team_1: -1 },
    });

    expect(result.success).toBe(false);
  });
});

describe("newsSignalsQuerySchema", () => {
  it("coerces days query values to number", () => {
    const parsed = newsSignalsQuerySchema.parse({ days: "7" });

    expect(parsed.days).toBe(7);
  });

  it("rejects out-of-range days", () => {
    const result = newsSignalsQuerySchema.safeParse({ days: "99" });

    expect(result.success).toBe(false);
  });
});
