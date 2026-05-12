import type {
  ValuationContextV2,
  ValuationResponse,
  ValuationResult,
} from "../api/engine";

export type ValuationUiAlertKind =
  | "thin_pool"
  | "unsupported_category"
  | "position_scarcity"
  | "monopoly"
  | "info";

export type ValuationUiAlertSeverity = "info" | "warning" | "critical";

export type ValuationUiAlert = {
  id: string;
  kind: ValuationUiAlertKind;
  severity: ValuationUiAlertSeverity;
  title: string;
  message: string;
};

export type ValuationAlertSurface =
  | "command-center"
  | "auction-center"
  | "research"
  | "my-draft";

export type NormalizeValuationAlertsOptions = {
  /**
   * When set, row-level scoring / explain signals come only from this player's
   * valuation row (Auction Center). When omitted, unique scoring warnings are
   * collected across the whole board (Command Center / My Draft).
   */
  focusPlayerId?: string | null;
  /**
   * Merged catalog + engine row (Auction Center); may carry `valuation_explain` /
   * `explain_v2` when the bare board row omits them.
   */
  focusPlayerRow?: ValuationResult | null;
};

const THIN_POOL_RE =
  /\b(thin|shallow)\s+(pool|bench|roster|draft)|\bthin\s+pool|bench\s+depth|pool\s+depth|remaining\s+pool|draftable\s+pool/i;
const MONOPOLY_RE =
  /\bmonopol(y|ies)|concentrat|corner(ed)?|hoard|team\s+stack|single-?team|one\s+team\s+owns/i;
const UNSUPPORTED_SCORING_RE =
  /\bunsupported|unknown\s+categor|not\s+mapped|missing\s+categor|category\s+not/i;

function stableId(parts: string[]): string {
  return parts.join("|").slice(0, 200);
}

function classifyContextWarning(text: string): {
  kind: ValuationUiAlertKind;
  severity: ValuationUiAlertSeverity;
  title: string;
} {
  const t = text.trim();
  if (THIN_POOL_RE.test(t)) {
    return { kind: "thin_pool", severity: "warning", title: "Thin pool" };
  }
  if (MONOPOLY_RE.test(t)) {
    return { kind: "monopoly", severity: "warning", title: "Market concentration" };
  }
  if (UNSUPPORTED_SCORING_RE.test(t)) {
    return {
      kind: "unsupported_category",
      severity: "warning",
      title: "Scoring setup",
    };
  }
  return {
    kind: "info",
    severity: "warning",
    title: "Valuation context",
  };
}

function mapPositionAlertSeverity(
  s: ValuationContextV2["position_alerts"][number]["severity"],
): ValuationUiAlertSeverity {
  switch (s) {
    case "critical":
      return "critical";
    case "high":
      return "warning";
    case "medium":
      return "warning";
    default:
      return "info";
  }
}

function scanValuationContext(ctx: Record<string, unknown>): ValuationUiAlert[] {
  const out: ValuationUiAlert[] = [];
  for (const [key, raw] of Object.entries(ctx)) {
    const lk = key.toLowerCase();
    if (typeof raw === "string" && raw.trim()) {
      if (MONOPOLY_RE.test(key) || lk.includes("monopoly")) {
        out.push({
          id: stableId(["ctx-str", key, raw]),
          kind: "monopoly",
          severity: "warning",
          title: "Market concentration",
          message: raw.trim(),
        });
      }
      continue;
    }
    if (!Array.isArray(raw)) continue;
    const strings = raw.filter(
      (x): x is string => typeof x === "string" && x.trim() !== "",
    );
    if (!strings.length) continue;
    if (MONOPOLY_RE.test(key) || lk.includes("monopoly")) {
      for (const line of strings) {
        out.push({
          id: stableId(["ctx-arr", key, line]),
          kind: "monopoly",
          severity: "warning",
          title: "Market concentration",
          message: line.trim(),
        });
      }
    }
  }
  return out;
}

function explainDriverUseful(
  d: NonNullable<ValuationResult["explain_v2"]>["drivers"][number],
): boolean {
  const blob = `${d.label} ${d.reason}`.toLowerCase();
  return (
    Math.abs(d.impact) >= 3 ||
    /\bscarci|monopol|thin|pool|inflat|concentrat/.test(blob)
  );
}

/**
 * Deduplicate alerts by id, then by kind+title+message.
 */
export function dedupeValuationAlerts(alerts: ValuationUiAlert[]): ValuationUiAlert[] {
  const byId = new Map<string, ValuationUiAlert>();
  const byTriple = new Set<string>();
  for (const a of alerts) {
    const triple = `${a.kind}\n${a.title}\n${a.message}`;
    if (byId.has(a.id)) continue;
    if (byTriple.has(triple)) continue;
    byId.set(a.id, a);
    byTriple.add(triple);
  }
  return [...byId.values()];
}

/**
 * Build UI alerts from the latest Engine board (or player-augmented) valuation JSON.
 */
export function normalizeValuationAlerts(
  response: ValuationResponse | null | undefined,
  options?: NormalizeValuationAlertsOptions,
): ValuationUiAlert[] {
  if (!response) return [];

  const out: ValuationUiAlert[] = [];
  const focusId = options?.focusPlayerId?.trim();

  for (const w of response.valuation_context_warnings ?? []) {
    const text = typeof w === "string" ? w.trim() : "";
    if (!text) continue;
    const c = classifyContextWarning(text);
    out.push({
      id: stableId(["vcw", c.kind, text]),
      kind: c.kind,
      severity: c.severity,
      title: c.title,
      message: text,
    });
  }

  const ctx = response.valuation_context;
  if (ctx && typeof ctx === "object" && !Array.isArray(ctx)) {
    try {
      out.push(...scanValuationContext(ctx as Record<string, unknown>));
    } catch {
      /* ignore malformed context */
    }
  }

  for (const note of response.market_notes ?? []) {
    if (typeof note !== "string") continue;
    const m = note.trim();
    if (m.length < 12 || m.length > 280) continue;
    if (!/\b(pool|scarc|market|inflat|draft|roster|bid)\b/i.test(m)) continue;
    out.push({
      id: stableId(["mn", m]),
      kind: "info",
      severity: "info",
      title: "Market note",
      message: m,
    });
  }

  for (const pa of response.context_v2?.position_alerts ?? []) {
    if (!pa?.message?.trim()) continue;
    out.push({
      id: stableId(["pos", pa.position, pa.message, pa.severity]),
      kind: "position_scarcity",
      severity: mapPositionAlertSeverity(pa.severity),
      title: `${pa.position} scarcity`,
      message: pa.message.trim(),
    });
  }

  const valuations = response.valuations ?? [];
  if (focusId) {
    const row = valuations.find((v) => String(v.player_id).trim() === focusId);
    const merged = options?.focusPlayerRow;
    const explain = merged?.valuation_explain ?? row?.valuation_explain;
    for (const line of explain?.scoring_category_warnings ?? []) {
      if (typeof line !== "string" || !line.trim()) continue;
      const t = line.trim();
      out.push({
        id: stableId(["score-focus", focusId, t]),
        kind: "unsupported_category",
        severity: "warning",
        title: "Scoring category",
        message: t,
      });
    }
    const drivers = (merged?.explain_v2 ?? row?.explain_v2)?.drivers;
    if (drivers?.length) {
      for (const d of drivers) {
        if (!explainDriverUseful(d)) continue;
        const msg = `${d.label}: ${d.reason}`.trim();
        out.push({
          id: stableId(["drv", focusId, d.label, d.reason]),
          kind: "info",
          severity: "info",
          title: "Value driver",
          message: msg,
        });
      }
    }
  } else {
    const seenScore = new Set<string>();
    for (const row of valuations) {
      for (const line of row.valuation_explain?.scoring_category_warnings ?? []) {
        if (typeof line !== "string" || !line.trim()) continue;
        const t = line.trim();
        if (seenScore.has(t)) continue;
        seenScore.add(t);
        out.push({
          id: stableId(["score-board", t]),
          kind: "unsupported_category",
          severity: "warning",
          title: "Scoring category",
          message: t,
        });
      }
    }
  }

  return dedupeValuationAlerts(out);
}

function positionMatchesAlert(
  alert: ValuationUiAlert,
  positions: readonly string[],
): boolean {
  if (alert.kind !== "position_scarcity") return true;
  const title = alert.title.toUpperCase();
  for (const p of positions) {
    const u = p.trim().toUpperCase();
    if (!u) continue;
    if (title.includes(u)) return true;
    if (alert.message.toUpperCase().includes(u)) return true;
  }
  return false;
}

/**
 * Per-surface filtering on top of {@link normalizeValuationAlerts}.
 */
export function filterValuationAlertsForSurface(
  alerts: ValuationUiAlert[],
  surface: ValuationAlertSurface,
  ctx?: { selectedPlayerPositions?: readonly string[] },
): ValuationUiAlert[] {
  const pos = (ctx?.selectedPlayerPositions ?? [])
    .map((p) => p.trim())
    .filter(Boolean);

  switch (surface) {
    case "research":
    case "my-draft":
      return alerts.filter(
        (a) =>
          a.kind === "thin_pool" ||
          a.kind === "unsupported_category" ||
          a.kind === "monopoly",
      );
    case "auction-center": {
      if (!pos.length) {
        return alerts.filter(
          (a) =>
            a.kind === "thin_pool" ||
            a.kind === "monopoly" ||
            a.kind === "unsupported_category" ||
            a.kind === "info",
        );
      }
      return alerts.filter((a) => {
        if (a.kind === "position_scarcity")
          return positionMatchesAlert(a, pos);
        return (
          a.kind === "thin_pool" ||
          a.kind === "monopoly" ||
          a.kind === "unsupported_category" ||
          a.kind === "info"
        );
      });
    }
    case "command-center":
    default:
      return alerts;
  }
}
