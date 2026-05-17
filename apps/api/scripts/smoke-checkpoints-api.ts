/**
 * Production smoke via Draft API (authenticated).
 */
const API = "https://at5ms22dhj.us-east-1.awsapprunner.com";
const EMAIL = "cursor.smoke.20260517@example.com";
const PASS = "SmokeTest2026!";

async function login() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("login failed");
  return data.token;
}

function analyze(label: string, data: Record<string, unknown>) {
  const vals = [...((data.valuations as { auction_value: number; name: string }[]) ?? [])].sort(
    (a, b) => b.auction_value - a.auction_value
  );
  let maxDrop = 0;
  for (let i = 1; i < Math.min(75, vals.length); i++) {
    maxDrop = Math.max(maxDrop, vals[i - 1]!.auction_value - vals[i]!.auction_value);
  }
  const mp = (data.context_v2 as { market_pressure?: Record<string, unknown> })
    ?.market_pressure as Record<string, { status?: string; sample_size?: number }> | undefined;
  console.log(
    JSON.stringify(
      {
        label,
        top1: vals[0]?.auction_value,
        judge: vals.find((v) => v.name === "Aaron Judge")?.auction_value,
        top10: vals.slice(0, 10).map((v) => ({
          name: v.name,
          av: v.auction_value,
          ui: Math.round(v.auction_value),
        })),
        ranks_34_40: vals.slice(33, 40).map((v, i) => ({
          rank: 34 + i,
          name: v.name,
          av: v.auction_value,
          ui: Math.round(v.auction_value),
        })),
        count_at_48: vals.filter((v) => Math.round(v.auction_value) === 48).length,
        max_adjacent_drop_top75: maxDrop,
        smoothing: data.curve_guardrails_applied,
        market_pressure: mp
          ? {
              inflation: mp.market_inflation?.status,
              sample_size: mp.market_inflation?.sample_size,
              budget: mp.budget_pressure?.status,
              keeper: mp.keeper_compression?.status,
            }
          : null,
      },
      null,
      2
    )
  );
}

async function main() {
  const token = await login();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  for (const ck of ["pre_draft", "after_pick_10", "after_pick_50"] as const) {
    const create = await fetch(`${API}/api/leagues/from-engine-checkpoint`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        checkpoint_key: ck,
        name: `[Demo] smoke ${ck}`,
      }),
    });
    const league = (await create.json()) as { _id?: string; id?: string };
    const leagueId = league._id ?? league.id;
    if (!leagueId) throw new Error(`create ${ck} failed: ${JSON.stringify(league)}`);

    const val = await fetch(`${API}/api/engine/leagues/${leagueId}/valuation`, {
      method: "POST",
      headers,
      body: "{}",
    });
    const data = (await val.json()) as Record<string, unknown>;
    analyze(`${ck} (${leagueId})`, data);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
