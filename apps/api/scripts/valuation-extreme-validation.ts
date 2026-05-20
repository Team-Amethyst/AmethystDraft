/**
 * Extreme valuation lifecycle validation (ordering, curve, parity, regressions).
 * Does not push or deploy.
 *
 *   cd apps/api && AMETHYST_API_URL=http://localhost:3099 pnpm exec tsx scripts/valuation-extreme-validation.ts
 */
import "dotenv/config";
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const API_DIR = path.resolve(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname));
const OUT_DIR = "/tmp/valuation-extreme-validation";
const ORDERING_OUT = path.join(OUT_DIR, "ordering-curve-audit.json");

type CmdResult = { name: string; ok: boolean; exitCode: number | null; output: string };

function run(name: string, cmd: string, env?: Record<string, string>): CmdResult {
  const result = spawnSync(cmd, {
    shell: true,
    cwd: API_DIR,
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 32 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return {
    name,
    ok: result.status === 0,
    exitCode: result.status,
    output: output.slice(-8000),
  };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const engineUrl = process.env.AMETHYST_API_URL ?? process.env.AMETHYST_API_BASE_URL ?? "http://localhost:3099";
  const env = { AMETHYST_API_URL: engineUrl, AMETHYST_API_BASE_URL: engineUrl };

  console.log(`\n=== Extreme valuation validation ===`);
  console.log(`Engine: ${engineUrl}`);
  console.log(`Output: ${OUT_DIR}\n`);

  const ordering = run(
    "valuation-ordering-curve-audit",
    `pnpm exec tsx scripts/valuation-ordering-curve-audit.ts --out=${ORDERING_OUT}`,
    env,
  );

  const regressions: CmdResult[] = [
    run("verify-economic-states", "pnpm exec tsx scripts/verify-economic-states.ts", env),
    run("early-draft-tier-shape-audit", "pnpm exec tsx scripts/early-draft-tier-shape-audit.ts", env),
    run("tracked-player-matrix", "pnpm exec tsx scripts/tracked-player-matrix.ts", env),
    run("cc-bid-consistency-audit", "pnpm exec tsx scripts/cc-bid-consistency-audit.ts", env),
    run("friendly-judge-collapse-audit", "pnpm exec tsx scripts/friendly-judge-collapse-audit.ts", env),
    run("stage3b-board-review", "pnpm exec tsx scripts/stage3b-board-review.ts", env),
  ];

  const engineRoot = path.resolve(API_DIR, "../../../AmethystAPI");
  const draftRoot = path.resolve(API_DIR, "../..");
  const engineTestsFixed = spawnSync("pnpm test --run 2>&1 | tail -40", {
    shell: true,
    cwd: engineRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 16 * 1024 * 1024,
  });
  regressions.push({
    name: "AmethystAPI vitest",
    ok: engineTestsFixed.status === 0,
    exitCode: engineTestsFixed.status,
    output: `${engineTestsFixed.stdout ?? ""}${engineTestsFixed.stderr ?? ""}`.trim().slice(-4000),
  });

  const bffTests = spawnSync("pnpm test --run 2>&1 | tail -25", {
    shell: true,
    cwd: API_DIR,
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 16 * 1024 * 1024,
  });
  regressions.push({
    name: "apps/api vitest",
    ok: bffTests.status === 0,
    exitCode: bffTests.status,
    output: `${bffTests.stdout ?? ""}${bffTests.stderr ?? ""}`.trim().slice(-3000),
  });

  const webTests = spawnSync("pnpm test --run 2>&1 | tail -25", {
    shell: true,
    cwd: path.join(draftRoot, "apps/web"),
    encoding: "utf8",
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });
  regressions.push({
    name: "apps/web vitest",
    ok: webTests.status === 0,
    exitCode: webTests.status,
    output: `${webTests.stdout ?? ""}${webTests.stderr ?? ""}`.trim().slice(-3000),
  });

  let orderingReport: any = null;
  if (fs.existsSync(ORDERING_OUT)) {
    orderingReport = JSON.parse(fs.readFileSync(ORDERING_OUT, "utf8"));
  }

  const acceptanceFails = orderingReport?.summary?.acceptance_failures ?? [];
  const anomalies = orderingReport?.rows?.reduce((n: number, r: any) => n + (r.anomalies?.length ?? 0), 0) ?? 0;
  const parityMismatches = orderingReport?.summary?.parity_mismatches?.length ?? 0;
  const allRegressionsOk = regressions.every((r) => r.ok);
  const orderingOk = ordering.ok && acceptanceFails.length === 0 && anomalies === 0 && parityMismatches === 0;

  const verdict = orderingOk && allRegressionsOk ? "PUSH_DEPLOY_READY" : "NOT_READY";

  const summary = {
    generated_at: new Date().toISOString(),
    engine_url: engineUrl,
    verdict,
    ordering_audit_ok: ordering.ok,
    acceptance_failures: acceptanceFails,
    anomaly_count: anomalies,
    parity_mismatch_count: parityMismatches,
    regressions: regressions.map((r) => ({ name: r.name, ok: r.ok, exitCode: r.exitCode })),
    state_highlights: (orderingReport?.rows ?? []).map((row: any) => ({
      state_id: row.state_id,
      curve_reason: row.curve_reason,
      pool: row.pool,
      max: row.curve?.max,
      tier_counts: row.curve?.tier_counts,
      top5: row.top50?.slice(0, 5).map((p: any) => `${p.rank}. ${p.name} $${p.display}`),
      tracked_elites: row.tracked
        ?.filter((t: any) =>
          ["Aaron Judge", "Juan Soto", "Julio Rodríguez", "Corbin Carroll", "Addison Barger", "Bryan Woo", "Tarik Skubal", "Spencer Jones"].includes(
            t.name,
          ),
        )
        .map((t: any) => ({
          name: t.name,
          rank: t.rank,
          display: t.display,
          tier: t.tier,
          pool: t.pool,
          reason: t.reason,
        })),
      anomalies: row.anomalies,
      acceptance: row.acceptance,
    })),
  };

  const summaryPath = path.join(OUT_DIR, "extreme-validation-summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log("\n--- Verdict ---");
  console.log(verdict);
  console.log(`Acceptance failures: ${acceptanceFails.length}`);
  console.log(`Anomalies: ${anomalies}`);
  console.log(`Parity mismatches: ${parityMismatches}`);
  console.log("\n--- Regressions ---");
  for (const r of regressions) {
    console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}`);
  }
  console.log(`\nFull ordering JSON: ${ORDERING_OUT}`);
  console.log(`Summary JSON: ${summaryPath}\n`);

  if (!orderingOk || !allRegressionsOk) process.exit(1);
}

main();
