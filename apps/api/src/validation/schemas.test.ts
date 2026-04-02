import { describe, expect, it } from "vitest";
import {
  mockPickSchema,
  newsSignalsQuerySchema,
  playersQuerySchema,
} from "./schemas";

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

describe("playersQuerySchema", () => {
  it("accepts valid player query values", () => {
    const parsed = playersQuerySchema.parse({
      sortBy: "adp",
      playerPool: "AL",
      posEligibilityThreshold: "15",
    });

    expect(parsed.sortBy).toBe("adp");
    expect(parsed.playerPool).toBe("AL");
    expect(parsed.posEligibilityThreshold).toBe(15);
  });

  it("rejects unsupported sort options", () => {
    const result = playersQuerySchema.safeParse({ sortBy: "salary" });

    expect(result.success).toBe(false);
  });
});
