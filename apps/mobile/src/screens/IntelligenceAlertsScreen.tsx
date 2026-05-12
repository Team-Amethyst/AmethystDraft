import { useCallback, useEffect, useState } from "react";
import {
  Button,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import {
  getNewsSignals,
  type NewsSignal,
} from "../api/engine";
import AppCard from "../components/ui/AppCard";
import AppChip from "../components/ui/AppChip";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/ScreenState";
import { useAuth } from "../contexts/AuthContext";
import type { LeagueTabParamList } from "../navigation/types";

type Props = BottomTabScreenProps<LeagueTabParamList, "Alerts">;

type AlertFilter =
  | "all"
  | "injury"
  | "role_change"
  | "trade"
  | "promotion"
  | "demotion";

const ALERT_FILTERS: { label: string; value: AlertFilter }[] = [
  { label: "All", value: "all" },
  { label: "Injuries", value: "injury" },
  { label: "Role", value: "role_change" },
  { label: "Trades", value: "trade" },
  { label: "Promotions", value: "promotion" },
  { label: "Demotions", value: "demotion" },
];

function formatAlertType(signalType: string): string {
  return signalType
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatAlertTime(effectiveDate: string): string {
  const parsed = new Date(effectiveDate);

  if (Number.isNaN(parsed.getTime())) {
    return "Just now";
  }

  const diffMinutes = Math.floor((Date.now() - parsed.getTime()) / 60000);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);

  return `${diffDays}d ago`;
}

function severityColors(severity: NewsSignal["severity"]) {
  if (severity === "high") {
    return {
      backgroundColor: "#fee2e2",
      color: "#991b1b",
      borderColor: "#fecaca",
    };
  }

  if (severity === "medium") {
    return {
      backgroundColor: "#fef3c7",
      color: "#92400e",
      borderColor: "#fde68a",
    };
  }

  return {
    backgroundColor: "#dcfce7",
    color: "#166534",
    borderColor: "#bbf7d0",
  };
}

function signalKey(signal: NewsSignal): string {
  return [
    signal.player_name,
    signal.effective_date,
    signal.signal_type,
    signal.description,
    signal.source,
  ].join("|");
}

export default function IntelligenceAlertsScreen(_props: Props) {
  const { token } = useAuth();

  const [filter, setFilter] = useState<AlertFilter>("all");
  const [signals, setSignals] = useState<NewsSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadSignals = useCallback(
    async (mode: "load" | "refresh" = "load") => {
      if (!token) return;

      if (mode === "load") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError("");

      try {
        const response = await getNewsSignals(token, {
          days: 7,
          signal_type: filter === "all" ? undefined : filter,
        });

        setSignals(response.signals ?? []);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load Intelligence Alerts.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, filter],
  );

  useEffect(() => {
    void loadSignals("load");
  }, [loadSignals]);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadSignals("refresh")}
          />
        }
      >
        <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 4 }}>
          Intelligence Alerts
        </Text>

        <Text style={{ color: "#4b5563", marginBottom: 16 }}>
          MLB injury, role, trade, promotion, and demotion signals from the Engine.
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 14 }}
        >
          {ALERT_FILTERS.map((item) => (
            <AppChip
              key={item.value}
              label={item.label}
              selected={filter === item.value}
              tone="info"
              onPress={() => setFilter(item.value)}
              style={{ marginRight: 8 }}
            />
          ))}
        </ScrollView>

        {error ? <ErrorState label={error} /> : null}

        <View style={{ marginBottom: 12 }}>
          <Button title="Refresh Alerts" onPress={() => void loadSignals("refresh")} />
        </View>

        {loading ? (
          <LoadingState label="Loading Intelligence Alerts..." />
        ) : signals.length === 0 ? (
          <EmptyState label="No MLB alerts match this filter right now." />
        ) : (
          signals.map((signal) => {
            const colors = severityColors(signal.severity);

            return (
              <TouchableOpacity key={signalKey(signal)} activeOpacity={0.85}>
                <AppCard>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      gap: 12,
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ fontSize: 17, fontWeight: "700", flex: 1 }}>
                      {signal.player_name}
                    </Text>

                    <Text style={{ color: "#6b7280", fontSize: 12 }}>
                      {formatAlertTime(signal.effective_date)}
                    </Text>
                  </View>

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    <Text
                      style={{
                        borderWidth: 1,
                        borderColor: colors.borderColor,
                        backgroundColor: colors.backgroundColor,
                        color: colors.color,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: "700",
                        textTransform: "uppercase",
                      }}
                    >
                      {signal.severity}
                    </Text>

                    <Text
                      style={{
                        backgroundColor: "#eef2ff",
                        color: "#3730a3",
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: "700",
                      }}
                    >
                      {formatAlertType(signal.signal_type)}
                    </Text>
                  </View>

                  <Text style={{ marginTop: 10, color: "#111827", lineHeight: 20 }}>
                    {signal.description}
                  </Text>

                  <Text style={{ marginTop: 8, color: "#6b7280", fontSize: 12 }}>
                    Source: {signal.source}
                  </Text>
                </AppCard>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}