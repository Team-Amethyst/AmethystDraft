import { describe, it, expect, vi, beforeEach } from "vitest";
import * as client from "./client";
import { importKeepers, startNewSeason } from "./leagues";

describe("league season API helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("startNewSeason sends POST to /api/leagues/:id/start-new-season", async () => {
    const spy = vi.spyOn(client, "requestJson").mockResolvedValue({ id: "new" } as never);
    await startNewSeason("abc123", { seasonYear: 2028 }, "mytoken");
    expect(spy).toHaveBeenCalledTimes(1);
    const [path, init] = spy.mock.calls[0]!;
    expect(path).toBe("/api/leagues/abc123/start-new-season");
    expect(init).toMatchObject({
      method: "POST",
      body: JSON.stringify({ seasonYear: 2028 }),
    });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer mytoken");
  });

  it("importKeepers sends POST to /api/leagues/:id/import-keepers", async () => {
    const spy = vi.spyOn(client, "requestJson").mockResolvedValue({ imported: 2 } as never);
    await importKeepers("newid", { fromLeagueId: "oldid" }, "tok2");
    expect(spy).toHaveBeenCalledTimes(1);
    const [path, init] = spy.mock.calls[0]!;
    expect(path).toBe("/api/leagues/newid/import-keepers");
    expect(init).toMatchObject({
      method: "POST",
      body: JSON.stringify({ fromLeagueId: "oldid" }),
    });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok2");
  });
});
