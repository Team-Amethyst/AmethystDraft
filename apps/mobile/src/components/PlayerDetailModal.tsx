import { Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import AppButton from "./ui/AppButton";
import AppCard from "./ui/AppCard";
import PositionBadge from "./ui/PositionBadge";
import { colors } from "../theme/colors";
import type { ValuationResult } from "../api/engine";
import type { Player } from "../types/player";
import type { StatBasis } from "@repo/player-stat-basis";

type DepthChartContext = {
  position: string;
  rank: number;
  status: string;
  usageStarts: number;
  usageAppearances: number;
  outOfPosition?: boolean;
  needsManualReview?: boolean;
  reasons?: string[];
};

type Props = {
  player: Player | null;
  visible: boolean;
  watched: boolean;
  custom: boolean;
  displayValue: number;
  displayTier: number;
  statSummary: string;
  statBasis?: StatBasis;
  engineRow?: ValuationResult;
  note?: string;
  onChangeNote?: (note: string) => void;
  draftedByTeam?: string;
  draftedPrice?: number;
  draftedContract?: string;
  isDrafted?: boolean;
  depthChartContext?: DepthChartContext | null;
  onClose: () => void;
  onToggleWatchlist: () => void;
  onMoveToCommandCenter: () => void;
  onEditCustom?: () => void;
  onRemoveCustom?: () => void;
};

type StatRow = {
  label: string;
  projection: string;
  lastYear: string;
  threeYear: string;
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

function playerRecord(player: Player): Record<string, unknown> {
  return player as unknown as Record<string, unknown>;
}

function formatMoney(value: number | null | undefined): string {
  const parsed = finiteNumber(value);

  if (parsed === null) return "—";
  return `$${Math.round(parsed)}`;
}

function formatSignedMoney(value: number | null | undefined): string {
  const parsed = finiteNumber(value);

  if (parsed === null) return "—";
  if (Math.round(parsed) === 0) return "$0";
  return `${parsed > 0 ? "+" : "-"}$${Math.abs(Math.round(parsed))}`;
}

function formatNumber(value: unknown, digits = 0): string {
  const parsed = finiteNumber(value);

  if (parsed === null) return "—";

  if (Math.abs(parsed) < 1 && parsed !== 0) {
    return parsed.toFixed(3).replace(/^0/, "");
  }

  return parsed.toFixed(digits);
}

function formatStat(value: unknown, digits = 0): string {
  if (value === undefined || value === null || value === "") return "—";

  const parsed = finiteNumber(value);

  if (parsed === null) {
    return String(value);
  }

  return formatNumber(parsed, digits);
}

function getPlayerImageUrl(player: Player): string | null {
  const record = playerRecord(player);
  const direct = record.headshotUrl ?? record.imageUrl ?? record.photoUrl ?? record.playerImageUrl ?? record.headshot;

  if (typeof direct === "string" && direct.trim()) {
    return direct;
  }

  const mlbId =
    finiteNumber(record.mlbId) ??
    finiteNumber(record.mlb_id) ??
    finiteNumber(record.playerId);

  if (mlbId === null) return null;

  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_160,q_auto:best/v1/people/${Math.round(mlbId)}/headshot/67/current`;
}

function displayPosition(player: Player): string {
  const positions = player.positions?.length ? player.positions.join("/") : player.position;
  return positions || "—";
}

function valueFromRow(row: ValuationResult | undefined, key: string): number | null {
  if (!row) return null;

  const record = row as unknown as Record<string, unknown>;
  return finiteNumber(record[key]);
}

function valueFromPlayer(player: Player, key: string): number | null {
  const record = playerRecord(player);
  return finiteNumber(record[key]);
}

function getAuctionRank(player: Player, row?: ValuationResult): number | null {
  return (
    valueFromRow(row, "auction_rank") ??
    valueFromPlayer(player, "auction_rank") ??
    valueFromPlayer(player, "catalog_rank") ??
    finiteNumber(player.adp)
  );
}

function getMarketAdp(player: Player, row?: ValuationResult): number | null {
  return (
    valueFromRow(row, "market_adp") ??
    valueFromPlayer(player, "market_adp") ??
    finiteNumber(player.adp)
  );
}

function getRecommendedBid(row?: ValuationResult): number | null {
  return valueFromRow(row, "recommended_bid") ?? valueFromRow(row, "auction_value");
}

function getTeamValue(row?: ValuationResult): number | null {
  return valueFromRow(row, "team_value") ?? valueFromRow(row, "auction_value");
}

function getBidEdge(row?: ValuationResult): number | null {
  return valueFromRow(row, "edge") ?? valueFromRow(row, "bid_edge");
}

function getMlbId(player: Player): string {
  const record = playerRecord(player);
  const mlbId =
    finiteNumber(record.mlbId) ??
    finiteNumber(record.mlb_id) ??
    finiteNumber(record.playerId);

  return mlbId === null ? "—" : String(Math.round(mlbId));
}

function statBasisLabel(statBasis: StatBasis | undefined): string {
  if (statBasis === "projections") return "PROJ";
  if (statBasis === "3-year-avg") return "3Y";
  return "1Y";
}

function battingRows(player: Player): StatRow[] {
  const proj = player.projection?.batting;
  const last = player.stats?.batting;
  const three = player.stats3yr?.batting;

  return [
    {
      label: "AVG",
      projection: formatStat(proj?.avg, 3),
      lastYear: formatStat(last?.avg, 3),
      threeYear: formatStat(three?.avg, 3),
    },
    {
      label: "HR",
      projection: formatStat(proj?.hr),
      lastYear: formatStat(last?.hr),
      threeYear: formatStat(three?.hr),
    },
    {
      label: "RBI",
      projection: formatStat(proj?.rbi),
      lastYear: formatStat(last?.rbi),
      threeYear: formatStat(three?.rbi),
    },
    {
      label: "R",
      projection: formatStat(proj?.runs),
      lastYear: formatStat(last?.runs),
      threeYear: formatStat(three?.runs),
    },
    {
      label: "SB",
      projection: formatStat(proj?.sb),
      lastYear: formatStat(last?.sb),
      threeYear: formatStat(three?.sb),
    },
  ];
}

function pitchingRows(player: Player): StatRow[] {
  const proj = player.projection?.pitching;
  const last = player.stats?.pitching;
  const three = player.stats3yr?.pitching;

  return [
    {
      label: "ERA",
      projection: formatStat(proj?.era, 2),
      lastYear: formatStat(last?.era, 2),
      threeYear: formatStat(three?.era, 2),
    },
    {
      label: "WHIP",
      projection: formatStat(proj?.whip, 2),
      lastYear: formatStat(last?.whip, 2),
      threeYear: formatStat(three?.whip, 2),
    },
    {
      label: "W",
      projection: formatStat(proj?.wins),
      lastYear: formatStat(last?.wins),
      threeYear: formatStat(three?.wins),
    },
    {
      label: "SV",
      projection: formatStat(proj?.saves),
      lastYear: formatStat(last?.saves),
      threeYear: formatStat(three?.saves),
    },
    {
      label: "K",
      projection: formatStat(proj?.strikeouts),
      lastYear: formatStat(last?.strikeouts),
      threeYear: formatStat(three?.strikeouts),
    },
  ];
}

function hasAnyStats(rows: StatRow[]): boolean {
  return rows.some(
    (row) => row.projection !== "—" || row.lastYear !== "—" || row.threeYear !== "—",
  );
}

function StatTable({ title, rows }: { title: string; rows: StatRow[] }) {
  if (!hasAnyStats(rows)) return null;

  return (
    <AppCard backgroundColor="#100c18" borderColor="#31224f">
      <Text style={{ color: colors.purple2, fontSize: 12, fontWeight: "900", letterSpacing: 1, marginBottom: 8 }}>
        {title}
      </Text>

      <View style={{ flexDirection: "row", paddingBottom: 7, borderBottomWidth: 1, borderBottomColor: "#31224f" }}>
        <Text style={{ flex: 1.1, color: colors.purple2, fontSize: 11, fontWeight: "900" }}>STAT</Text>
        <Text style={{ flex: 1, color: colors.purple2, fontSize: 11, fontWeight: "900", textAlign: "right" }}>PROJ</Text>
        <Text style={{ flex: 1, color: colors.purple2, fontSize: 11, fontWeight: "900", textAlign: "right" }}>1Y</Text>
        <Text style={{ flex: 1, color: colors.purple2, fontSize: 11, fontWeight: "900", textAlign: "right" }}>3Y</Text>
      </View>

      {rows.map((row) => (
        <View
          key={row.label}
          style={{
            flexDirection: "row",
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: "#241b37",
          }}
        >
          <Text style={{ flex: 1.1, color: colors.purple2, fontSize: 13, fontWeight: "900" }}>{row.label}</Text>
          <Text style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: "800", textAlign: "right" }}>{row.projection}</Text>
          <Text style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: "800", textAlign: "right" }}>{row.lastYear}</Text>
          <Text style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: "800", textAlign: "right" }}>{row.threeYear}</Text>
        </View>
      ))}
    </AppCard>
  );
}

function MetricTile({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: "46%",
        borderLeftWidth: 1,
        borderLeftColor: "#31224f",
        paddingLeft: 12,
        paddingVertical: 8,
        marginBottom: 8,
      }}
    >
      <Text style={{ color: colors.purple2, fontSize: 10, fontWeight: "900", letterSpacing: 0.7, textTransform: "uppercase" }}>
        {label}
      </Text>
      <Text style={{ color: highlight ? colors.gold : colors.text, fontSize: 26, fontWeight: "900", marginTop: 4 }}>
        {value}
      </Text>
    </View>
  );
}

function ProfileLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 7 }}>
      <Text style={{ color: colors.purple2, fontWeight: "900" }}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: "900" }}>{value}</Text>
    </View>
  );
}

function ExplanationList({ engineRow }: { engineRow?: ValuationResult }) {
  const rows: string[] = [];

  if (engineRow?.why?.length) {
    rows.push(...engineRow.why);
  }

  if (engineRow?.recommended_bid_note) {
    rows.push(engineRow.recommended_bid_note);
  }

  if (engineRow?.edge_note) {
    rows.push(engineRow.edge_note);
  }

  if (engineRow?.explain_v2?.drivers?.length) {
    for (const driver of engineRow.explain_v2.drivers.slice(0, 4)) {
      rows.push(`${driver.label}: ${driver.reason}`);
    }
  }

  if (rows.length === 0) {
    return (
      <Text style={{ color: colors.muted, marginTop: 8, lineHeight: 20 }}>
        No model explanation available for this player yet.
      </Text>
    );
  }

  return (
    <View style={{ marginTop: 8 }}>
      {rows.slice(0, 6).map((item, index) => (
        <Text key={`${index}-${item}`} style={{ color: colors.muted, lineHeight: 20, marginBottom: 5 }}>
          • {item}
        </Text>
      ))}
    </View>
  );
}

export default function PlayerDetailModal({
  player,
  visible,
  watched,
  custom,
  displayValue,
  displayTier,
  statSummary,
  statBasis,
  engineRow,
  note = "",
  onChangeNote,
  draftedByTeam,
  draftedPrice,
  draftedContract,
  isDrafted: isDraftedProp,
  depthChartContext,
  onClose,
  onToggleWatchlist,
  onMoveToCommandCenter,
  onEditCustom,
  onRemoveCustom,
}: Props) {
  if (!player) return null;

  const imageUrl = getPlayerImageUrl(player);
  const positions = displayPosition(player).split("/").filter(Boolean);
  const isDrafted = Boolean(
    isDraftedProp || draftedByTeam || draftedPrice !== undefined || draftedContract,
  );
  const auctionValue = isDrafted
    ? null
    : finiteNumber(displayValue) ?? valueFromRow(engineRow, "auction_value") ?? finiteNumber(player.value);
  const recommendedBid = isDrafted ? null : getRecommendedBid(engineRow);
  const teamValue = isDrafted ? null : getTeamValue(engineRow);
  const bidEdge = isDrafted ? null : getBidEdge(engineRow);
  const auctionRank = getAuctionRank(player, engineRow);
  const marketAdp = getMarketAdp(player, engineRow);
  const indicator = engineRow?.indicator ?? playerRecord(player).indicator;
  const injury = player.injuryStatus?.trim();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 42 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 28, fontWeight: "900" }}>
              Player Detail
            </Text>

            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: colors.purple2, fontSize: 16, fontWeight: "900" }}>
                Close
              </Text>
            </TouchableOpacity>
          </View>

          <AppCard backgroundColor="#100c18" borderColor="#31224f">
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={{
                    width: 88,
                    height: 88,
                    borderRadius: 44,
                    marginRight: 14,
                    backgroundColor: "#272033",
                    borderWidth: 1,
                    borderColor: "#4c3575",
                  }}
                />
              ) : (
                <View
                  style={{
                    width: 88,
                    height: 88,
                    borderRadius: 44,
                    marginRight: 14,
                    backgroundColor: "#272033",
                    borderWidth: 1,
                    borderColor: "#4c3575",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: colors.purple2, fontSize: 28, fontWeight: "900" }}>
                    {player.name.slice(0, 1)}
                  </Text>
                </View>
              )}

              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 27, fontWeight: "900" }}>
                  {player.name}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 15, marginTop: 7 }}>
                  {player.team || "FA"}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 7 }}>
                  {positions.slice(0, 5).map((position) => (
                    <PositionBadge key={position} label={position} />
                  ))}
                  {custom ? <PositionBadge label="Custom" /> : null}
                </View>
              </View>
            </View>
          </AppCard>

          <AppCard backgroundColor="#100c18" borderColor="#31224f">
            {isDrafted ? (
              <Text style={{ color: colors.muted, marginBottom: 10, lineHeight: 20 }}>
                This player is already drafted. Live auction recommendation numbers are hidden; paid price is shown in Profile.
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              <MetricTile label="Auction Value" value={formatMoney(auctionValue)} highlight={!isDrafted} />
              <MetricTile label="Recommended Bid" value={formatMoney(recommendedBid)} />
              <MetricTile label="Team Value" value={formatMoney(teamValue)} />
              <MetricTile label="Bid Edge" value={formatSignedMoney(bidEdge)} />
            </View>
          </AppCard>

          <AppCard backgroundColor="#100c18" borderColor="#31224f">
            <Text style={{ color: colors.purple2, fontSize: 12, fontWeight: "900", letterSpacing: 1, marginBottom: 6 }}>
              PROFILE
            </Text>
            <ProfileLine label="Age" value={formatNumber(player.age)} />
            <ProfileLine label="MLB ID" value={getMlbId(player)} />

            {!isDrafted ? (
              <>
                <ProfileLine
                  label="Auction rank"
                  value={auctionRank === null ? "—" : String(Math.round(auctionRank))}
                />
                <ProfileLine
                  label="Market ADP"
                  value={marketAdp === null ? "—" : formatNumber(marketAdp, 2)}
                />
                <ProfileLine
                  label="Auction tier"
                  value={displayTier ? String(Math.round(displayTier)) : "—"}
                />
              </>
            ) : null}

            <ProfileLine
              label="Indicator"
              value={typeof indicator === "string" ? indicator : "—"}
            />
            <ProfileLine
              label="Drafted"
              value={isDrafted ? `Yes - ${draftedByTeam ?? "Drafted"}` : "Available"}
            />

            {!isDrafted && draftedContract ? (
              <ProfileLine label="Contract" value={draftedContract} />
            ) : null}

            {injury ? <ProfileLine label="Injury" value={injury} /> : null}
          </AppCard>

          {depthChartContext ? (
            <AppCard backgroundColor="#101a2a" borderColor="#334155">
              <Text style={{ color: colors.blue, fontSize: 12, fontWeight: "900", letterSpacing: 1, marginBottom: 8 }}>
                DEPTH CHART CONTEXT
              </Text>
              <ProfileLine label="Slot" value={`${depthChartContext.position} #${depthChartContext.rank}`} />
              <ProfileLine label="Status" value={depthChartContext.status || "—"} />
              <ProfileLine label="Usage" value={`${depthChartContext.usageStarts} starts · ${depthChartContext.usageAppearances} apps`} />
              {depthChartContext.outOfPosition || depthChartContext.needsManualReview ? (
                <Text style={{ color: "#fca5a5", marginTop: 8, fontWeight: "900" }}>
                  Needs review / out-of-position assignment
                </Text>
              ) : null}
              {depthChartContext.reasons?.length ? (
                <Text style={{ color: colors.muted, marginTop: 8 }}>
                  {depthChartContext.reasons.join(" · ")}
                </Text>
              ) : null}
            </AppCard>
          ) : null}

          <StatTable title="BATTING" rows={battingRows(player)} />
          <StatTable title="PITCHING" rows={pitchingRows(player)} />

          <AppCard backgroundColor="#100c18" borderColor="#31224f">
            <Text style={{ color: colors.purple2, fontSize: 12, fontWeight: "900", letterSpacing: 1 }}>
              WHY THIS VALUE?
            </Text>
            <ExplanationList engineRow={engineRow} />
          </AppCard>

          <AppCard backgroundColor="#100c18" borderColor="#31224f">
            <Text style={{ color: colors.purple2, fontSize: 12, fontWeight: "900", letterSpacing: 1, marginBottom: 8 }}>
              STAT SNAPSHOT · {statBasisLabel(statBasis)}
            </Text>
            <Text style={{ color: colors.muted, lineHeight: 20 }}>
              {statSummary || "No stat summary available."}
            </Text>
          </AppCard>

          {player.outlook ? (
            <AppCard backgroundColor="#100c18" borderColor="#31224f">
              <Text style={{ color: colors.purple2, fontSize: 12, fontWeight: "900", letterSpacing: 1, marginBottom: 8 }}>
                MODEL NOTES
              </Text>
              <Text style={{ color: colors.muted, lineHeight: 20 }}>{player.outlook}</Text>
            </AppCard>
          ) : null}

          <AppCard backgroundColor="#100c18" borderColor="#31224f">
            <Text style={{ color: colors.purple2, fontSize: 12, fontWeight: "900", letterSpacing: 1, marginBottom: 8 }}>
              PLAYER NOTES
            </Text>
            {onChangeNote ? (
              <TextInput
                value={note}
                onChangeText={onChangeNote}
                placeholder="Capture target bid, fallback options, roster fit, and risk notes..."
                placeholderTextColor="#7c6a9f"
                multiline
                style={{
                  minHeight: 96,
                  borderWidth: 1,
                  borderColor: "#31224f",
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: colors.text,
                  backgroundColor: "#090712",
                  textAlignVertical: "top",
                }}
              />
            ) : (
              <Text style={{ color: colors.muted, lineHeight: 20 }}>
                {note.trim() || "No note yet."}
              </Text>
            )}
          </AppCard>

          <View style={{ flexDirection: "row", marginTop: 2 }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <AppButton
                title={watched ? "Remove Star" : "Star Player"}
                variant={watched ? "secondary" : "primary"}
                onPress={onToggleWatchlist}
                fullWidth
              />
            </View>
            <View style={{ flex: 1 }}>
              <AppButton
                title="Draft in Command Center"
                onPress={onMoveToCommandCenter}
                fullWidth
              />
            </View>
          </View>

          {custom ? (
            <View style={{ marginTop: 10 }}>
              <AppButton
                title="Edit Custom Player"
                variant="secondary"
                onPress={onEditCustom ?? onClose}
                fullWidth
              />
              <View style={{ height: 10 }} />
              <AppButton
                title="Remove Custom Player"
                variant="danger"
                onPress={onRemoveCustom ?? onClose}
                fullWidth
              />
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}


