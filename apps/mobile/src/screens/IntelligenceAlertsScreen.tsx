import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useNewsSignalsRealtime } from "../hooks/useNewsSignalsRealtime";
import type { NewsSocketConnectionState } from "../hooks/useNewsSignalsRealtime";
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

function socketStatusLabel(state: NewsSocketConnectionState): string {
  if (state === null) return "Connecting";
  if (state === true) return "Live";
  return "Offline";
}

function socketStatusColor(state: NewsSocketConnectionState) {
  if (state === null) {
    return {
      backgroundColor: "#fef3c7",
      color: "#92400e",
      borderColor: "#fde68a",
    };
  }

  if (state === true) {
    return {
      backgroundColor: "#dcfce7",
      color: "#166534",
      borderColor: "#bbf7d0",
    };
  }

  return {
    backgroundColor: "#f3f4f6",
    color: "#4b5563",
    borderColor: "#e5e7eb",
  };
}

function matchesFilter(signal: NewsSignal, filter: AlertFilter): boolean {
  if (filter === "all") {
    return true;
  }

  const signalType = signal.signal_type.toLowerCase().replace(/[-\s]+/g, "_");

  if (filter === "role_change") {
    return signalType === "role_change" || signalType.includes("role");
  }

  return signalType === filter || signalType.includes(filter);
}

export default function IntelligenceAlertsScreen(_props: Props) {
  const { token } = useAuth();

  const [filter, setFilter] = useState<AlertFilter>("all");
  const [allSignals, setAllSignals] = useState<NewsSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [socketState, setSocketState] =
    useState<NewsSocketConnectionState>(false);
  const [liveNotice, setLiveNotice] = useState("");

  const loadSignals = useCallback(
    async (mode: "load" | "refresh" = "load") => {
      if (!token) {
        setLoading(false);
        return;
      }

      if (mode === "load") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError("");

      try {
        const response = await getNewsSignals(token, {
          days: 7,
        });

        setAllSignals(response.signals ?? []);
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
    [token],
  );

  const signals = useMemo(() => {
    return allSignals.filter((signal) => matchesFilter(signal, filter));
  }, [allSignals, filter]);

  useNewsSignalsRealtime(
    token,
    Boolean(token),
    () => {
      setLiveNotice("Live update received. Refreshing alerts...");
      void loadSignals("refresh");
    },
    (message) => {
      setLiveNotice(message || "Webhook test received — live connection OK.");
      void loadSignals("refresh");
    },
    setSocketState,
  );

  useEffect(() => {
    void loadSignals("load");
  }, [loadSignals]);

  const socketColors = socketStatusColor(socketState);

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
        <Text style={{ fontSize: 24, fontWeight: "800", marginBottom: 4 }}>
          Intelligence Alerts
        </Text>

        <Text style={{ color: "#4b5563", marginBottom: 12 }}>
          MLB injury, role, trade, promotion, and demotion signals from the Engine.
        </Text>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <Text
            style={{
              borderWidth: 1,
              borderColor: socketColors.borderColor,
              backgroundColor: socketColors.backgroundColor,
              color: socketColors.color,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              fontSize: 12,
              fontWeight: "800",
              overflow: "hidden",
            }}
          >
            Realtime: {socketStatusLabel(socketState)}
          </Text>

          <Text style={{ marginLeft: 10, color: "#6b7280", fontSize: 12 }}>
            Pull down to refresh manually
          </Text>
        </View>

        {liveNotice ? (
          <AppCard backgroundColor="#eef2ff" borderColor="#c7d2fe">
            <Text style={{ color: "#3730a3", fontWeight: "700" }}>
              {liveNotice}
            </Text>
          </AppCard>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 14 }}
          contentContainerStyle={{ paddingRight: 12 }}
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
          <Button
            title="Refresh Alerts"
            onPress={() => void loadSignals("refresh")}
          />
        </View>

        {loading ? (
          <LoadingState label="Loading Intelligence Alerts..." />
        ) : signals.length === 0 ? (
          <EmptyState label="No MLB alerts match this filter right now." />
        ) : (
          signals.map((signal) => {
            const badgeColors = severityColors(signal.severity);

            return (
              <TouchableOpacity key={signalKey(signal)} activeOpacity={0.85}>
                <AppCard backgroundColor="#151021" borderColor="#31224f">
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 17,
                        fontWeight: "800",
                        flex: 1,
                        color: "#f9fafb",
                        paddingRight: 8,
                      }}
                    >
                      {signal.player_name}
                    </Text>

                    <Text style={{ color: "#9ca3af", fontSize: 12 }}>
                      {formatAlertTime(signal.effective_date)}
                    </Text>
                  </View>

                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    <Text
                      style={{
                        borderWidth: 1,
                        borderColor: badgeColors.borderColor,
                        backgroundColor: badgeColors.backgroundColor,
                        color: badgeColors.color,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: "800",
                        textTransform: "uppercase",
                        overflow: "hidden",
                        marginRight: 8,
                        marginBottom: 8,
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
                        fontWeight: "800",
                        overflow: "hidden",
                        marginBottom: 8,
                      }}
                    >
                      {formatAlertType(signal.signal_type)}
                    </Text>
                  </View>

                  <Text style={{ marginTop: 4, color: "#d1d5db", lineHeight: 20 }}>
                    {signal.description}
                  </Text>

                  <Text style={{ marginTop: 8, color: "#9ca3af", fontSize: 12 }}>
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