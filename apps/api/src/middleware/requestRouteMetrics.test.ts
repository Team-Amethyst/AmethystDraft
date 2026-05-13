import { describe, expect, it } from "vitest";
import { bucketHttpPath } from "./requestRouteMetrics";

describe("bucketHttpPath", () => {
  it("groups valuation and player explain routes", () => {
    expect(
      bucketHttpPath("/api/engine/leagues/abc123/valuation"),
    ).toBe("/api/engine/leagues/:leagueId/valuation");
    expect(
      bucketHttpPath("/api/engine/leagues/abc123/valuation/player"),
    ).toBe("/api/engine/leagues/:leagueId/valuation/player");
  });

  it("groups socket.io and health", () => {
    expect(bucketHttpPath("/socket.io/?EIO=4&transport=polling")).toBe(
      "/socket.io/*",
    );
    expect(bucketHttpPath("/api/health")).toBe("/api/health");
  });

  it("strips query strings", () => {
    expect(
      bucketHttpPath("/api/engine/signals/news?days=7&signal_type=injury"),
    ).toBe("/api/engine/signals/news");
  });

  it("maps players list", () => {
    expect(bucketHttpPath("/api/players?sortBy=catalog_rank")).toBe(
      "/api/players",
    );
  });

  it("splits internal news-signals hook and debug from generic internal", () => {
    expect(bucketHttpPath("/api/internal/news-signals/hook")).toBe(
      "/api/internal/news-signals/hook",
    );
    expect(bucketHttpPath("/api/internal/news-signals/debug")).toBe(
      "/api/internal/news-signals/debug",
    );
    expect(bucketHttpPath("/api/internal/other")).toBe("/api/internal/*");
  });
});
