import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { buildEngineValuationCalculateBodyFromFixture } from "./engineContext";
import { valuationRequestSchema } from "../validation/valuationRequestSchema";

/** Resolved from apps/api when tests run via `pnpm --filter api test`. */
const checkpointsDir = path.join(
  process.cwd(),
  "test-fixtures",
  "player-api",
  "checkpoints",
);

describe("valuation fixtures -> engine POST body", () => {
  const files = readdirSync(checkpointsDir).filter((f) => f.endsWith(".json"));

  it.each(files)("maps %s to stable engine payload", (file) => {
    const raw = JSON.parse(
      readFileSync(path.join(checkpointsDir, file), "utf8"),
    ) as unknown;
    const fixture = valuationRequestSchema.parse(raw);
    const body = buildEngineValuationCalculateBodyFromFixture(fixture);
    expect(body).toMatchSnapshot();
  });
});

describe("fixture draft sizes", () => {
  it("after_130 has 130 auction picks in drafted_players and keeper in pre_draft_rosters", () => {
    const raw = JSON.parse(
      readFileSync(path.join(checkpointsDir, "after_130.json"), "utf8"),
    ) as unknown;
    const fixture = valuationRequestSchema.parse(raw);
    const body = buildEngineValuationCalculateBodyFromFixture(fixture);
    expect(body.drafted_players).toHaveLength(130);
    expect(body.pre_draft_rosters).toBeDefined();
    expect(
      (body.pre_draft_rosters as { team_id: string; players: unknown[] }[])[0]
        ?.players,
    ).toHaveLength(1);
    expect(body.budget_by_team_id).toBeDefined();
    expect(Object.keys(body.budget_by_team_id ?? {}).length).toBeGreaterThan(0);
  });
});

describe.skipIf(!process.env.AMETHYST_CONTRACT_TEST)(
  "live engine contract (set AMETHYST_CONTRACT_TEST=1 + AMETHYST_API_URL + AMETHYST_API_KEY)",
  () => {
    it("posts pre_draft fixture to engine", async () => {
      const { amethyst } = await import("./amethyst");
      const raw = JSON.parse(
        readFileSync(path.join(checkpointsDir, "pre_draft.json"), "utf8"),
      ) as unknown;
      const fixture = valuationRequestSchema.parse(raw);
      const context = buildEngineValuationCalculateBodyFromFixture(fixture);
      const { data } = await amethyst.post("/valuation/calculate", context);
      expect(data).toBeDefined();
    });
  },
);
