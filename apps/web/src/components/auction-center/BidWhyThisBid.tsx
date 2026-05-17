import type { ValuationExplain, ValuationResult } from "../../api/engine";
import type { Player } from "../../types/player";
import {
  BASELINE_STRENGTH_TOOLTIP,
  REPLACEMENT_COMPARISON_SLOT_TOOLTIP,
  formatCurrencyWhole,
  formatExplainRiskMultiplier,
  formatInflationFactorMultiple,
  formatMaybeDollar,
  formatPoolToSlotRatio,
  formatValuationExplainAgeDepthComponent,
  isMeaningfulExplainMultiplier,
  valuationExplainHasRiskRoleContent,
} from "../../utils/valuation";
import {
  cleanedYourValueAndRecommendedBid,
  commandCenterEdgeVsMaxBidRounded,
  engineFiniteOrNull,
  mergeDisplayValuationRow,
  valuationExplainHasBidContextTable,
} from "../../domain/auctionCenterValuation";
import { buildBidDecisionPlainSummary } from "../../domain/bidDecisionPlainSummary";
import { leagueWideAuctionDollars } from "../../utils/valuation";
import {
  formatSignedWhole,
  summarizeDriverReason,
  truncateExplainText,
} from "../../utils/explainV2Ui";

const WHY_LINE_MAX = 160;

function injurySeverityText(v: string | number | undefined): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? undefined : t;
  }
  return undefined;
}

function WhyRow({
  label,
  value,
  labelTitle,
}: {
  label: string;
  value: string;
  labelTitle?: string;
}) {
  return (
    <div className="bdc-why-row">
      <span className="bdc-why-row__k" title={labelTitle}>
        {label}
      </span>
      <span className="bdc-why-row__v">{value}</span>
    </div>
  );
}

function buildContextRows(
  explain: ValuationExplain,
): { label: string; value: string; labelTitle?: string }[] {
  const rows: { label: string; value: string; labelTitle?: string }[] = [];
  if (explain.effective_positions?.length) {
    rows.push({ label: "Effective positions", value: explain.effective_positions.join(", ") });
  }
  if (explain.replacement_key_used) {
    rows.push({
      label: "Replacement comparison slot",
      value: explain.replacement_key_used,
      labelTitle: REPLACEMENT_COMPARISON_SLOT_TOOLTIP,
    });
  }
  if (explain.replacement_value_used != null) {
    rows.push({
      label: "Replacement value",
      value: formatMaybeDollar(explain.replacement_value_used) ?? "—",
    });
  }
  if (explain.surplus_basis) {
    rows.push({ label: "Surplus basis", value: explain.surplus_basis });
  }
  if (explain.inflation_factor != null) {
    rows.push({
      label: "Inflation factor",
      value: formatInflationFactorMultiple(explain.inflation_factor),
    });
  }
  if (explain.pool_to_slot_ratio != null) {
    rows.push({
      label: "Pool / slot ratio",
      value: formatPoolToSlotRatio(explain.pool_to_slot_ratio),
    });
  }
  if (explain.scoring_category_warnings?.length) {
    rows.push({
      label: "Scoring warnings",
      value: truncateExplainText(explain.scoring_category_warnings.join(" · "), 100),
    });
  }
  return rows;
}

function buildRiskRows(explain: ValuationExplain): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (
    typeof explain.age_years === "number" &&
    Number.isFinite(explain.age_years) &&
    explain.age_years > 0
  ) {
    rows.push({ label: "Age", value: String(Math.round(explain.age_years)) });
  }
  if (isMeaningfulExplainMultiplier(explain.age_multiplier)) {
    rows.push({
      label: "Age multiplier",
      value: formatExplainRiskMultiplier(explain.age_multiplier),
    });
  }
  if (explain.depth_chart_position_resolved) {
    rows.push({ label: "Depth slot", value: explain.depth_chart_position_resolved });
  }
  if (isMeaningfulExplainMultiplier(explain.depth_multiplier)) {
    rows.push({
      label: "Depth multiplier",
      value: formatExplainRiskMultiplier(explain.depth_multiplier),
    });
  }
  if (isMeaningfulExplainMultiplier(explain.age_depth_combined_multiplier)) {
    rows.push({
      label: "Age + role multiplier",
      value: formatExplainRiskMultiplier(explain.age_depth_combined_multiplier),
    });
  }
  const inj = injurySeverityText(explain.injury_severity);
  if (inj) rows.push({ label: "Injury severity", value: inj });
  if (isMeaningfulExplainMultiplier(explain.injury_multiplier)) {
    rows.push({
      label: "Injury multiplier",
      value: formatExplainRiskMultiplier(explain.injury_multiplier),
    });
  }
  const ageC = formatValuationExplainAgeDepthComponent(explain.age_component);
  if (ageC) rows.push({ label: "Age adjustment", value: ageC });
  const depC = formatValuationExplainAgeDepthComponent(explain.depth_component);
  if (depC) rows.push({ label: "Depth adjustment", value: depC });
  return rows;
}

export function BidWhyThisBid({
  valuationRow,
  selectedPlayer,
  displayBid = null,
  displayYour = null,
  notBidable = false,
  notBidableReason = null,
  budgetLimited = false,
}: {
  valuationRow: ValuationResult | null | undefined;
  selectedPlayer: Player;
  displayBid?: number | null;
  displayYour?: number | null;
  notBidable?: boolean;
  notBidableReason?: string | null;
  budgetLimited?: boolean;
}) {
  const merged = mergeDisplayValuationRow(valuationRow ?? undefined, selectedPlayer);
  const row = merged ?? valuationRow ?? undefined;

  const baselineForWhy =
    engineFiniteOrNull(merged?.baseline_value) ??
    engineFiniteOrNull(row?.baseline_value) ??
    engineFiniteOrNull(selectedPlayer.baseline_value);

  const rbNote =
    (typeof row?.recommended_bid_note === "string" ? row.recommended_bid_note.trim() : "") ||
    (typeof selectedPlayer.recommended_bid_note === "string"
      ? selectedPlayer.recommended_bid_note.trim()
      : "");
  const edgeNote =
    (typeof row?.edge_note === "string" ? row.edge_note.trim() : "") ||
    (typeof selectedPlayer.edge_note === "string" ? selectedPlayer.edge_note.trim() : "");
  const explain = row?.valuation_explain ?? selectedPlayer.valuation_explain;
  const explainV2 = row?.explain_v2 ?? selectedPlayer.explain_v2;
  const why = row?.why ?? selectedPlayer.why;

  const contextRows = explain && valuationExplainHasBidContextTable(explain) ? buildContextRows(explain) : [];
  const riskRows =
    explain && valuationExplainHasRiskRoleContent(explain) ? buildRiskRows(explain) : [];
  const hasV2 = Boolean(
    explainV2 &&
      (explainV2.drivers?.length ||
        explainV2.indicator ||
        typeof explainV2.confidence === "number"),
  );
  const hasWhy = Boolean(why && why.length > 0);

  const hasEngine =
    rbNote !== "" ||
    edgeNote !== "" ||
    contextRows.length > 0 ||
    riskRows.length > 0 ||
    hasV2 ||
    hasWhy;

  const showFallback =
    baselineForWhy == null &&
    rbNote === "" &&
    edgeNote === "" &&
    contextRows.length === 0 &&
    riskRows.length === 0 &&
    !hasV2 &&
    !hasWhy;

  const cleaned = cleanedYourValueAndRecommendedBid(row ?? null, selectedPlayer);
  const leagueFmv =
    engineFiniteOrNull(row?.auction_value) ??
    leagueWideAuctionDollars(selectedPlayer) ??
    null;
  const bidForSummary = displayBid ?? cleaned?.bid ?? null;
  const yourForSummary = displayYour ?? cleaned?.yourValue ?? null;
  const edgeForSummary = commandCenterEdgeVsMaxBidRounded(
    yourForSummary,
    bidForSummary,
  );
  const plainSummary = buildBidDecisionPlainSummary({
    valuationRow: row,
    selectedPlayer,
    leagueFmv,
    suggestedBid: bidForSummary,
    teamValue: yourForSummary,
    bidEdge: edgeForSummary,
    notBidable,
    notBidableReason,
    budgetLimited,
  });

  const hasTechnical =
    baselineForWhy != null ||
    rbNote !== "" ||
    edgeNote !== "" ||
    contextRows.length > 0 ||
    riskRows.length > 0 ||
    hasV2 ||
    hasWhy;

  return (
    <details className="bdc-why-bid">
      <summary className="bdc-why-bid__summary">
        <span className="bdc-why-bid__chevron" aria-hidden="true" />
        <span className="bdc-why-bid__summary-text">
          <span className="bdc-why-bid__summary-label">Why this bid?</span>
          <span className="bdc-why-bid__summary-hint">
            <span className="bdc-why-bid__hint-when-closed">Summary and model details</span>
            <span className="bdc-why-bid__hint-when-open">Hide</span>
          </span>
        </span>
      </summary>
      <div className="bdc-why-bid__body">
        {plainSummary ? (
          <section className="bdc-why-plain" aria-label="Bid summary">
            <p className="bdc-why-plain__headline">{plainSummary.headline}</p>
            <p className="bdc-why-plain__detail">{plainSummary.detail}</p>
          </section>
        ) : null}
        {hasTechnical ? (
          <section className="bdc-why-engine" aria-label="Model and engine details">
            <h4 className="bdc-why-engine__title">Model and engine details</h4>
            <div className="bdc-why-engine__body">
        {baselineForWhy != null ? (
          <section className="bdc-why-panel bdc-why-panel--baseline" aria-label="Baseline strength">
            <WhyRow
              label="Baseline Strength"
              value={formatCurrencyWhole(baselineForWhy)}
              labelTitle={BASELINE_STRENGTH_TOOLTIP}
            />
          </section>
        ) : null}
        {hasEngine || showFallback ? (
          <>
            {(rbNote !== "" || edgeNote !== "") && (
              <div className="bdc-why-notes">
                {rbNote !== "" ? <p className="bdc-why-note-line">{rbNote}</p> : null}
                {edgeNote !== "" ? <p className="bdc-why-note-line">{edgeNote}</p> : null}
              </div>
            )}
            {(contextRows.length > 0 || riskRows.length > 0) && (
              <div
                className={
                  "bdc-why-panels" +
                  (contextRows.length > 0 && riskRows.length > 0
                    ? " bdc-why-panels--split"
                    : " bdc-why-panels--single")
                }
              >
                {contextRows.length > 0 ? (
                  <section className="bdc-why-panel" aria-label="Auction context">
                    <h4 className="bdc-why-panel__title">Auction context</h4>
                    <div className="bdc-why-rows">
                      {contextRows.map((r) => (
                        <WhyRow
                          key={r.label}
                          label={r.label}
                          value={r.value}
                          labelTitle={r.labelTitle}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}
                {riskRows.length > 0 ? (
                  <section className="bdc-why-panel" aria-label="Risk and role">
                    <h4 className="bdc-why-panel__title">Risk / role</h4>
                    <div className="bdc-why-rows">
                      {riskRows.map((r) => (
                        <WhyRow key={r.label} label={r.label} value={r.value} />
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            )}
            {hasWhy && why ? (
              <ul className="bdc-why-bullets bdc-why-bullets--primary">
                {why.slice(0, 2).map((line, i) => (
                  <li key={i}>{truncateExplainText(line, WHY_LINE_MAX)}</li>
                ))}
              </ul>
            ) : null}
            {hasV2 && explainV2 ? (
              <section className="bdc-why-panel bdc-why-panel--full" aria-label="Model drivers">
                <div className="bdc-why-panel__head">
                  <h4 className="bdc-why-panel__title bdc-why-panel__title--inline">Model read</h4>
                  <div className="bdc-why-v2-badges">
                    <span className="bdc-why-v2-indicator">{explainV2.indicator}</span>
                    {typeof explainV2.confidence === "number" &&
                    Number.isFinite(explainV2.confidence) ? (
                      <span className="bdc-why-v2-confidence">
                        {Math.round(explainV2.confidence * 100)}% confidence
                      </span>
                    ) : null}
                  </div>
                </div>
                {explainV2.adjustments ? (
                  <div className="bdc-why-v2-adjustments" aria-label="Model adjustment totals">
                    <span className="bdc-why-v2-adj">
                      <span className="bdc-why-v2-adj__k">League inflation</span>
                      <span className="bdc-why-v2-adj__v">{formatSignedWhole(explainV2.adjustments.inflation)}</span>
                    </span>
                    <span className="bdc-why-v2-adj">
                      <span className="bdc-why-v2-adj__k">Scarcity</span>
                      <span className="bdc-why-v2-adj__v">{formatSignedWhole(explainV2.adjustments.scarcity)}</span>
                    </span>
                    <span className="bdc-why-v2-adj">
                      <span className="bdc-why-v2-adj__k">Other</span>
                      <span className="bdc-why-v2-adj__v">{formatSignedWhole(explainV2.adjustments.other)}</span>
                    </span>
                  </div>
                ) : null}
                {explainV2.drivers?.length ? (
                  <div className="bdc-why-driver-cards">
                    {explainV2.drivers.slice(0, 3).map((d, i) => {
                      const { preview, full } = summarizeDriverReason(d.reason);
                      const showMore = preview !== full;
                      const impactTone =
                        d.impact > 0 ? "pos" : d.impact < 0 ? "neg" : "neutral";
                      return (
                        <div
                          key={`${i}-${d.label}`}
                          className={`bdc-why-driver-card bdc-why-driver-card--${impactTone}`}
                        >
                          <div className="bdc-why-driver-card__top">
                            <span className="bdc-why-driver-name">{d.label}</span>
                            <span className={`bdc-why-driver-impact bdc-why-driver-impact--${impactTone}`}>
                              {formatSignedWhole(d.impact)}
                            </span>
                          </div>
                          <p className="bdc-why-driver-preview">{preview}</p>
                          {showMore ? (
                            <details className="bdc-why-driver-expand">
                              <summary className="bdc-why-driver-expand__summary">Full engine note</summary>
                              <p className="bdc-why-driver-full">{truncateExplainText(full, 520)}</p>
                            </details>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        ) : showFallback ? (
          <p className="bdc-why-fallback">Open player details for model explanation.</p>
        ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </details>
  );
}
