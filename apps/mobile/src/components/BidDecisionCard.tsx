import { Text, View } from "react-native";
import type { ValuationResult } from "../api/engine";
import type { Player } from "../types/player";

type Props = {
  valuationRow: ValuationResult | null;
  selectedPlayer: Player;
  isDrafted?: boolean;
};

const COLORS = {
  panel: "#120d1f",
  panel2: "#171027",
  border: "#302147",
  text: "#f8f5ff",
  muted: "#a996c8",
  dim: "#7c6a9e",
  purple: "#a855f7",
  yellow: "#facc15",
  green: "#22c55e",
  red: "#fb7185",
};

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function money(value: number | null | undefined): string {
  const parsed = finiteNumber(value);

  if (parsed === null) {
    return "—";
  }

  return `$${Math.round(parsed)}`;
}

function signedMoney(value: number | null | undefined): string {
  const parsed = finiteNumber(value);

  if (parsed === null) {
    return "—";
  }

  const rounded = Math.round(parsed);

  if (rounded === 0) {
    return "$0";
  }

  return `${rounded > 0 ? "+" : "-"}$${Math.abs(rounded)}`;
}

function getAuctionValue(row: ValuationResult | null, player: Player): number | null {
  return (
    finiteNumber(row?.auction_value) ??
    finiteNumber(row?.baseline_value) ??
    finiteNumber(player.value)
  );
}

function getTeamValue(row: ValuationResult | null, player: Player): number | null {
  return (
    finiteNumber(row?.team_value) ??
    finiteNumber(row?.auction_value) ??
    finiteNumber(player.value)
  );
}

function getRecommendedBid(row: ValuationResult | null, player: Player): number | null {
  return (
    finiteNumber(row?.recommended_bid) ??
    finiteNumber(row?.team_value) ??
    finiteNumber(row?.auction_value) ??
    finiteNumber(player.value)
  );
}

function getEdge(row: ValuationResult | null, player: Player): number | null {
  const explicit = finiteNumber(row?.edge);

  if (explicit !== null) {
    return explicit;
  }

  const teamValue = getTeamValue(row, player);
  const bid = getRecommendedBid(row, player);

  if (teamValue === null || bid === null) {
    return null;
  }

  return teamValue - bid;
}

function decisionLabel(edge: number | null, indicator?: string): string {
  if (indicator) {
    return indicator;
  }

  if (edge === null) {
    return "Need more data";
  }

  if (edge >= 5) {
    return "Steal";
  }

  if (edge <= -5) {
    return "Reach";
  }

  return "Fair Value";
}

function decisionColor(label: string): string {
  const lower = label.toLowerCase();

  if (lower.includes("steal") || lower.includes("good")) {
    return COLORS.green;
  }

  if (lower.includes("reach") || lower.includes("careful")) {
    return COLORS.red;
  }

  return COLORS.yellow;
}

function shortText(value: string, max = 180): string {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max).trim()}...`;
}

function Metric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={{ width: "50%", paddingRight: 8, marginBottom: 12 }}>
      <Text
        style={{
          color: COLORS.muted,
          fontSize: 10,
          fontWeight: "900",
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: highlight ? COLORS.yellow : COLORS.text,
          fontSize: 22,
          fontWeight: "900",
          marginTop: 2,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export default function BidDecisionCard({
  valuationRow,
  selectedPlayer,
  isDrafted = false,
}: Props) {
  const auctionValue = isDrafted ? null : getAuctionValue(valuationRow, selectedPlayer);
  const recommendedBid = isDrafted ? null : getRecommendedBid(valuationRow, selectedPlayer);
  const teamValue = isDrafted ? null : getTeamValue(valuationRow, selectedPlayer);
  const edge = isDrafted ? null : getEdge(valuationRow, selectedPlayer);
  const label = isDrafted ? "Already Drafted" : decisionLabel(edge, valuationRow?.indicator);
  const color = decisionColor(label);
  const explainV2 = valuationRow?.explain_v2;
  const whyLines = valuationRow?.why ?? [];

  return (
    <View
      style={{
        backgroundColor: COLORS.panel,
        borderColor: COLORS.border,
        borderWidth: 1,
        borderRadius: 16,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <Text
          style={{
            color: COLORS.purple,
            fontSize: 11,
            fontWeight: "900",
            letterSpacing: 1.5,
            textTransform: "uppercase",
          }}
        >
          Bid Decision
        </Text>
        <Text style={{ color, fontWeight: "900" }}>
          {label}
        </Text>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <Metric label="Auction Value" value={money(auctionValue)} highlight />
        <Metric label="Recommended Bid" value={money(recommendedBid)} highlight />
        <Metric label="Team Value" value={money(teamValue)} />
        <Metric label="Bid Edge" value={signedMoney(edge)} />
      </View>

      {valuationRow?.recommended_bid_note ? (
        <Text style={{ color: COLORS.muted, marginBottom: 6 }}>
          {valuationRow.recommended_bid_note}
        </Text>
      ) : null}

      {valuationRow?.edge_note ? (
        <Text style={{ color: COLORS.muted, marginBottom: 6 }}>
          {valuationRow.edge_note}
        </Text>
      ) : null}

      <View
        style={{
          marginTop: 4,
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
        }}
      >
        <Text style={{ color: COLORS.text, fontWeight: "900", marginBottom: 6 }}>
          Why this bid?
        </Text>

        {isDrafted ? (
          <Text style={{ color: COLORS.dim }}>
            This player already has a roster entry in this league. The draft result is historical context, so live bid recommendation numbers are hidden.
          </Text>
        ) : explainV2 ? (
          <>
            <Text style={{ color: COLORS.muted, marginBottom: 4 }}>
              Confidence: {Math.round((explainV2.confidence ?? 0) * 100)}%
            </Text>
            <Text style={{ color: COLORS.muted, marginBottom: 4 }}>
              Scarcity: {money(finiteNumber(explainV2.adjustments?.scarcity))}
            </Text>
            <Text style={{ color: COLORS.muted, marginBottom: 4 }}>
              Inflation: {money(finiteNumber(explainV2.adjustments?.inflation))}
            </Text>
            {explainV2.drivers?.slice(0, 4).map((driver, index) => (
              <Text
                key={`${driver.label}-${index}`}
                style={{ color: COLORS.muted, marginTop: 6, lineHeight: 19 }}
              >
                • {driver.label}: {money(finiteNumber(driver.impact))} —{" "}
                {shortText(driver.reason)}
              </Text>
            ))}
          </>
        ) : whyLines.length > 0 ? (
          whyLines.slice(0, 4).map((line, index) => (
            <Text
              key={`${line}-${index}`}
              style={{ color: COLORS.muted, marginBottom: 5, lineHeight: 19 }}
            >
              • {shortText(line)}
            </Text>
          ))
        ) : (
          <Text style={{ color: COLORS.dim }}>
            Engine reasoning will appear when valuation explanation is available.
          </Text>
        )}
      </View>
    </View>
  );
}
