import { describe, expect, it } from "vitest";
import {
  mockPickSchema,
  newsSignalsQuerySchema,
  playersQuerySchema,
  updateProfileSchema,
  changePasswordSchema,
  valuationPlayerBodySchema,
  catalogBatchValuesBodySchema,
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

  it("accepts legacy player pool labels and zero threshold", () => {
    const parsed = playersQuerySchema.parse({
      playerPool: "Mixed MLB",
      posEligibilityThreshold: "0",
    });

    expect(parsed.playerPool).toBe("Mixed");
    expect(parsed.posEligibilityThreshold).toBe(0);
  });

  it("rejects unsupported sort options", () => {
    const result = playersQuerySchema.safeParse({ sortBy: "salary" });

    expect(result.success).toBe(false);
  });
});

describe("updateProfileSchema", () => {
  it("accepts valid update data", () => {
    const parsed = updateProfileSchema.parse({
      displayName: "New Name",
      email: "new@example.com",
    });

    expect(parsed.displayName).toBe("New Name");
    expect(parsed.email).toBe("new@example.com");
  });

  it("accepts partial updates", () => {
    const parsed = updateProfileSchema.parse({
      displayName: "New Name",
    });

    expect(parsed.displayName).toBe("New Name");
    expect(parsed.email).toBeUndefined();
  });

  it("rejects invalid email", () => {
    const result = updateProfileSchema.safeParse({
      email: "invalid",
    });

    expect(result.success).toBe(false);
  });
});

describe("valuationPlayerBodySchema", () => {
  it("accepts player_id", () => {
    expect(valuationPlayerBodySchema.parse({ player_id: "660271" })).toEqual({
      player_id: "660271",
    });
  });

  it("rejects empty player_id", () => {
    expect(valuationPlayerBodySchema.safeParse({ player_id: "" }).success).toBe(
      false,
    );
  });
});

describe("catalogBatchValuesBodySchema", () => {
  it("accepts player_ids only", () => {
    expect(
      catalogBatchValuesBodySchema.parse({ player_ids: ["a", "b"] }),
    ).toEqual({ player_ids: ["a", "b"] });
  });

  it("rejects empty player_ids array", () => {
    expect(
      catalogBatchValuesBodySchema.safeParse({ player_ids: [] }).success,
    ).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  it("accepts valid password change", () => {
    const parsed = changePasswordSchema.parse({
      currentPassword: "oldpass",
      newPassword: "newpass123",
    });

    expect(parsed.currentPassword).toBe("oldpass");
    expect(parsed.newPassword).toBe("newpass123");
  });

  it("rejects short new password", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "oldpass",
      newPassword: "short",
    });

    expect(result.success).toBe(false);
  });
});
