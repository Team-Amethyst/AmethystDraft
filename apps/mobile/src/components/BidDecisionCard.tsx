import { Text, View } from "react-native";
import type { ValuationResult } from "../api/engine";
import type { Player } from "../types/player";

type Props = {
  valuationRow: ValuationResult | null;
  selectedPlayer: Player;
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

function money(value: number | null): string {
  if (value === null) return "—";
  return `$${Math.round(value)}`;
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

function getDecisionTone(edge: number | null): {
  label: string;
  color: string;
  bg: string;
  border: string;
} {
  if (edge === null) {
    return {
      label: "Need more data",
      color: "#374151",
      bg: "#f9fafb",
      border: "#e5e7eb",
    };
  }

  if (edge >= 5) {
    return {
      label: "Good value",
      color: "#166534",
      bg: "#dcfce7",
      border: "#bbf7d0",
    };
  }

  if (edge <= -5) {
    return {
      label: "Be careful",
      color: "#991b1b",
      bg: "#fee2e2",
      border: "#fecaca",
    };
  }

  return {
    label: "Fair price",
    color: "#92400e",
    bg: "#fef3c7",
    border: "#fde68a",
  };
}

function shortText(value: string, max = 150): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max).trim()}...`;
}

export default function BidDecisionCard({ valuationRow, selectedPlayer }: Props) {
  const auctionValue = getAuctionValue(valuationRow, selectedPlayer);
  const recommendedBid = getRecommendedBid(valuationRow, selectedPlayer);
  const teamValue = getTeamValue(valuationRow, selectedPlayer);
  const edge = getEdge(valuationRow, selectedPlayer);
  const tone = getDecisionTone(edge);

  const explainV2 = valuationRow?.explain_v2;
  const whyLines = valuationRow?.why ?? [];

  return (
    <View
      style={{
        marginTop: 10,
        padding: 12,
        borderRadius: 12,
        backgroundColor: tone.bg,
        borderWidth: 1,
        borderColor: tone.border,
      }}
    >
      <Text
        style={{
          color: tone.color,
          fontWeight: "900",
          fontSize: 16,
          marginBottom: 10,
        }}
      >
        Bid Decision: {tone.label}
      </Text>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <View style={{ width: "50%", paddingRight: 6, marginBottom: 10 }}>
          <Text style={{ color: "#6b7280", fontSize: 12 }}>Auction Value</Text>
          <Text style={{ fontWeight: "900", fontSize: 18 }}>
            {money(auctionValue)}
          </Text>
        </View>

        <View style={{ width: "50%", paddingLeft: 6, marginBottom: 10 }}>
          <Text style={{ color: "#6b7280", fontSize: 12 }}>Recommended Bid</Text>
          <Text style={{ fontWeight: "900", fontSize: 18 }}>
            {money(recommendedBid)}
          </Text>
        </View>

        <View style={{ width: "50%", paddingRight: 6 }}>
          <Text style={{ color: "#6b7280", fontSize: 12 }}>Team Value</Text>
          <Text style={{ fontWeight: "900", fontSize: 18 }}>
            {money(teamValue)}
          </Text>
        </View>

        <View style={{ width: "50%", paddingLeft: 6 }}>
          <Text style={{ color: "#6b7280", fontSize: 12 }}>Bid Edge</Text>
          <Text style={{ fontWeight: "900", fontSize: 18 }}>
            {money(edge)}
          </Text>
        </View>
      </View>

      {valuationRow?.indicator ? (
        <Text style={{ color: tone.color, fontWeight: "700", marginTop: 4 }}>
          Engine label: {valuationRow.indicator}
        </Text>
      ) : null}

      {explainV2 ? (
        <View
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: tone.border,
          }}
        >
          <Text style={{ fontWeight: "800", marginBottom: 6 }}>
            Why this bid?
          </Text>

          <Text style={{ color: "#4b5563", marginBottom: 4 }}>
            Confidence: {Math.round((explainV2.confidence ?? 0) * 100)}%
          </Text>

          <Text style={{ color: "#4b5563", marginBottom: 4 }}>
            Scarcity: {money(finiteNumber(explainV2.adjustments?.scarcity))}
          </Text>

          <Text style={{ color: "#4b5563", marginBottom: 4 }}>
            Inflation: {money(finiteNumber(explainV2.adjustments?.inflation))}
          </Text>

          {explainV2.drivers?.slice(0, 3).map((driver, index) => (
            <Text key={`${driver.label}-${index}`} style={{ color: "#4b5563", marginTop: 6 }}>
              • {driver.label}: {money(finiteNumber(driver.impact))} —{" "}
              {shortText(driver.reason)}
            </Text>
          ))}
        </View>
      ) : whyLines.length > 0 ? (
        <View
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: tone.border,
          }}
        >
          <Text style={{ fontWeight: "800", marginBottom: 6 }}>
            Why this bid?
          </Text>

          {whyLines.slice(0, 3).map((line, index) => (
            <Text key={index} style={{ color: "#4b5563", marginBottom: 4 }}>
              • {shortText(line)}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={{ color: "#6b7280", marginTop: 8 }}>
          Engine reasoning will appear when valuation explanation is available.
        </Text>
      )}
    </View>
  );
}