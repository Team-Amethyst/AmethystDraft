import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getNewsSignals, type NewsSignal } from "../../api/engine";
import { useAuth } from "../../contexts/AuthContext";
import { useLeague } from "../../contexts/LeagueContext";
import {
  useNewsSignalsRealtime,
  type NewsSocketConnectionState,
} from "../../hooks/useNewsSignalsRealtime";
import type { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";
import type { League } from "../../types/league";

type Props = {
  leagueId: string;
  leagueName: string;
  navigation: NativeStackNavigationProp<RootStackParamList, "LeagueTabs">;
};

type AlertFilter =
  | "all"
  | "injuries"
  | "role"
  | "trades"
  | "promotions"
  | "demotions";

const ALERT_FILTERS: { label: string; value: AlertFilter }[] = [
  { label: "All", value: "all" },
  { label: "Injuries", value: "injuries" },
  { label: "Role", value: "role" },
  { label: "Trades", value: "trades" },
  { label: "Promotions", value: "promotions" },
  { label: "Demotions", value: "demotions" },
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
      bg: "#3b1218",
      border: "#ef4444",
      text: "#fecaca",
    };
  }

  if (severity === "medium") {
    return {
      bg: "#3a2608",
      border: "#f59e0b",
      text: "#fde68a",
    };
  }

  return {
    bg: "#102b1a",
    border: "#22c55e",
    text: "#bbf7d0",
  };
}

function statusLabel(state: NewsSocketConnectionState): string {
  if (state === null) return "Connecting";
  if (state === true) return "Live";
  return "Offline";
}

function currentInitial(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return "U";
  return trimmed.slice(0, 1).toUpperCase();
}

function leagueStatusLabel(league: League): string {
  if (league.draftStatus === "pre-draft") return "Pre-draft";
  if (league.draftStatus === "in-progress") return "In progress";
  if (league.draftStatus === "completed") return "Completed";
  return String(league.draftStatus);
}

function signalKey(signal: NewsSignal): string {
  return [
    signal.player_name,
    signal.effective_date,
    signal.signal_type,
    signal.description,
  ].join("|");
}

function includesAny(text: string, words: string[]): boolean {
  for (const word of words) {
    if (text.includes(word)) {
      return true;
    }
  }

  return false;
}

function matchesFilter(signal: NewsSignal, filter: AlertFilter): boolean {
  if (filter === "all") return true;

  const type = signal.signal_type.toLowerCase();
  const description = signal.description.toLowerCase();
  const combined = `${type} ${description}`;

  if (filter === "injuries") {
    return includesAny(combined, [
      "injury",
      "injured",
      "il",
      "15-day",
      "60-day",
      "activated",
      "shoulder",
      "elbow",
      "hamstring",
      "forearm",
      "inflammation",
      "discomfort",
    ]);
  }

  if (filter === "role") {
    return includesAny(combined, [
      "role",
      "lineup",
      "closer",
      "setup",
      "starter",
      "rotation",
      "batting order",
      "platoon",
      "playing time",
      "depth",
    ]);
  }

  if (filter === "trades") {
    return includesAny(combined, [
      "trade",
      "traded",
      "acquired",
      "sent to",
      "claimed",
      "waiver",
      "waivers",
    ]);
  }

  if (filter === "promotions") {
    return includesAny(combined, [
      "promotion",
      "promoted",
      "called up",
      "call up",
      "recalled",
      "selected contract",
      "selected the contract",
    ]);
  }

  if (filter === "demotions") {
    return includesAny(combined, [
      "demotion",
      "demoted",
      "optioned",
      "assigned",
      "designated",
      "dfa",
      "outrighted",
      "sent down",
    ]);
  }

  return true;
}

function ShellButton({
  children,
  onPress,
  minWidth,
}: {
  children: ReactNode;
  onPress: () => void;
  minWidth?: number;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      style={{
        minWidth,
        minHeight: 36,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 8,
        alignItems: "center",
        justifyContent: "center",
        marginLeft: 6,
      }}
    >
      {children}
    </TouchableOpacity>
  );
}

function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.55)",
          justifyContent: "flex-start",
          alignItems: "flex-end",
          paddingTop: 76,
          paddingHorizontal: 12,
        }}
      >
        <Pressable
          onPress={onClose}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
          }}
        />

        <View
          style={{
            width: "100%",
            maxWidth: 410,
            height: "78%",
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            borderRadius: 18,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              paddingHorizontal: 16,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: colors.text,
                fontSize: 17,
                fontWeight: "900",
                flex: 1,
                paddingRight: 12,
              }}
            >
              {title}
            </Text>

            <TouchableOpacity activeOpacity={0.82} onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.purple2} />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1 }}>{children}</View>
        </View>
      </View>
    </Modal>
  );
}

export default function LeagueHeaderActions({
  leagueId,
  leagueName,
  navigation,
}: Props) {
  const { user, token, logout } = useAuth();
  const { allLeagues, refreshLeagues } = useLeague();

  const [leagueSheetOpen, setLeagueSheetOpen] = useState(false);
  const [alertsSheetOpen, setAlertsSheetOpen] = useState(false);
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);

  const [signals, setSignals] = useState<NewsSignal[]>([]);
  const [alertFilter, setAlertFilter] = useState<AlertFilter>("all");
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState("");
  const [socketState, setSocketState] = useState<NewsSocketConnectionState>(false);

  const currentLeague =
    allLeagues.find((league) => league.id === leagueId) ?? null;

  const displayName = user?.displayName ?? "User";
  const email = user?.email ?? "";

  const filteredSignals = useMemo(() => {
    return signals.filter((signal) => matchesFilter(signal, alertFilter));
  }, [signals, alertFilter]);

  const loadSignals = useCallback(async () => {
    if (!token) {
      setSignals([]);
      return;
    }

    setAlertsLoading(true);
    setAlertsError("");

    try {
      const response = await getNewsSignals(token, { days: 7 });
      setSignals(response.signals ?? []);
    } catch (err) {
      setAlertsError(
        err instanceof Error ? err.message : "Unable to load notifications.",
      );
    } finally {
      setAlertsLoading(false);
    }
  }, [token]);

  useNewsSignalsRealtime(
    token,
    Boolean(token),
    () => {
      void loadSignals();
    },
    () => {
      void loadSignals();
    },
    setSocketState,
  );

  useEffect(() => {
    void loadSignals();
  }, [loadSignals]);

  async function openLeagueSheet() {
    setLeagueSheetOpen(true);
    await refreshLeagues();
  }

  function switchLeague(league: League) {
    setLeagueSheetOpen(false);

    navigation.replace("LeagueTabs", {
      leagueId: league.id,
      leagueName: league.name,
      screen: "Research",
      params: { leagueId: league.id },
    });
  }

  async function handleLogout() {
    setAccountSheetOpen(false);
    await logout();
  }

  function openAccount() {
    setAccountSheetOpen(false);
    navigation.navigate("Account");
  }

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", marginRight: 8 }}>
        <ShellButton minWidth={116} onPress={() => void openLeagueSheet()}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text
              numberOfLines={1}
              style={{
                color: colors.text,
                fontSize: 12,
                fontWeight: "900",
                maxWidth: 96,
              }}
            >
              {currentLeague?.name ?? leagueName}
            </Text>

            <Ionicons
              name="chevron-down"
              size={14}
              color={colors.purple2}
              style={{ marginLeft: 6 }}
            />
          </View>
        </ShellButton>

        <ShellButton onPress={() => setAlertsSheetOpen(true)}>
          <View>
            <Ionicons name="notifications-outline" size={19} color={colors.purple2} />

            {signals.length > 0 ? (
              <View
                style={{
                  position: "absolute",
                  right: -7,
                  top: -7,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: colors.purple,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 3,
                }}
              >
                <Text style={{ color: colors.white, fontSize: 9, fontWeight: "900" }}>
                  {signals.length > 99 ? "99+" : signals.length}
                </Text>
              </View>
            ) : null}
          </View>
        </ShellButton>

        <ShellButton onPress={() => setAccountSheetOpen(true)}>
          <Text style={{ color: colors.white, fontWeight: "900", fontSize: 13 }}>
            {currentInitial(displayName)}
          </Text>
        </ShellButton>
      </View>

      <Sheet
        visible={leagueSheetOpen}
        title={currentLeague?.name ?? leagueName}
        onClose={() => setLeagueSheetOpen(false)}
      >
        <ScrollView style={{ flex: 1 }}>
          {allLeagues.length === 0 ? (
            <View style={{ padding: 16 }}>
              <Text style={{ color: colors.muted }}>No leagues found.</Text>
            </View>
          ) : (
            allLeagues.map((league) => {
              const selected = league.id === leagueId;

              return (
                <TouchableOpacity
                  key={league.id}
                  activeOpacity={0.84}
                  onPress={() => switchLeague(league)}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    backgroundColor: selected ? "#2a1d45" : colors.surface,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: colors.text,
                          fontWeight: "900",
                          fontSize: 15,
                        }}
                      >
                        {league.name}
                      </Text>

                      <Text style={{ color: colors.muted, marginTop: 4, fontSize: 12 }}>
                        {league.teams} teams · ${league.budget} budget
                      </Text>
                    </View>

                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: selected ? colors.purple2 : colors.border,
                        backgroundColor: selected ? colors.purple : colors.surface2,
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                      }}
                    >
                      <Text
                        style={{
                          color: selected ? colors.white : colors.purple2,
                          fontSize: 11,
                          fontWeight: "900",
                        }}
                      >
                        {leagueStatusLabel(league)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          <TouchableOpacity
            activeOpacity={0.84}
            onPress={() => {
              setLeagueSheetOpen(false);
              navigation.navigate("Leagues");
            }}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 16,
            }}
          >
            <Text style={{ color: colors.purple2, fontWeight: "900" }}>
              All Leagues
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </Sheet>

      <Sheet
        visible={alertsSheetOpen}
        title="Intelligence Alerts"
        onClose={() => setAlertsSheetOpen(false)}
      >
        <View style={{ flex: 1 }}>
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {ALERT_FILTERS.map((item) => {
                const selected = alertFilter === item.value;

                return (
                  <TouchableOpacity
                    key={item.value}
                    activeOpacity={0.82}
                    onPress={() => setAlertFilter(item.value)}
                    style={{
                      borderWidth: 1,
                      borderColor: selected ? colors.purple2 : colors.border,
                      backgroundColor: selected ? "#3b235f" : colors.surface,
                      borderRadius: 999,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      marginRight: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? colors.white : colors.text,
                        fontWeight: "900",
                        fontSize: 13,
                      }}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
            nestedScrollEnabled
          >
            {alertsLoading ? (
              <View style={{ padding: 20, alignItems: "center" }}>
                <ActivityIndicator color={colors.purple2} />
                <Text style={{ color: colors.muted, marginTop: 10 }}>
                  Loading alerts...
                </Text>
              </View>
            ) : null}

            {alertsError ? (
              <View style={{ padding: 16 }}>
                <Text style={{ color: colors.red }}>{alertsError}</Text>
              </View>
            ) : null}

            {!alertsLoading && !alertsError && filteredSignals.length === 0 ? (
              <View style={{ padding: 16 }}>
                <Text style={{ color: colors.muted }}>
                  No alerts match this filter right now.
                </Text>
              </View>
            ) : null}

            {filteredSignals.map((signal) => {
              const badge = severityColors(signal.severity);

              return (
                <View
                  key={signalKey(signal)}
                  style={{
                    borderWidth: 1,
                    borderColor:
                      signal.severity === "high"
                        ? "#7f1d1d"
                        : signal.severity === "medium"
                          ? "#854d0e"
                          : colors.border,
                    backgroundColor:
                      signal.severity === "high"
                        ? "#1c0d14"
                        : signal.severity === "medium"
                          ? "#17111b"
                          : colors.surface2,
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 10,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        color: colors.text,
                        fontWeight: "900",
                        fontSize: 16,
                        flex: 1,
                        paddingRight: 10,
                      }}
                    >
                      {signal.player_name}
                    </Text>

                    <Text style={{ color: colors.muted, fontSize: 12 }}>
                      {formatAlertTime(signal.effective_date)}
                    </Text>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      flexWrap: "wrap",
                      marginBottom: 8,
                    }}
                  >
                    <View
                      style={{
                        backgroundColor: badge.bg,
                        borderRadius: 999,
                        paddingHorizontal: 9,
                        paddingVertical: 4,
                        marginRight: 8,
                        marginBottom: 6,
                      }}
                    >
                      <Text
                        style={{
                          color: badge.text,
                          fontSize: 11,
                          fontWeight: "900",
                          textTransform: "uppercase",
                        }}
                      >
                        {signal.severity}
                      </Text>
                    </View>

                    <View
                      style={{
                        backgroundColor: "#2e2550",
                        borderRadius: 999,
                        paddingHorizontal: 9,
                        paddingVertical: 4,
                        marginRight: 8,
                        marginBottom: 6,
                      }}
                    >
                      <Text
                        style={{
                          color: "#d8c5ff",
                          fontSize: 11,
                          fontWeight: "900",
                        }}
                      >
                        {formatAlertType(signal.signal_type)}
                      </Text>
                    </View>

                    <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>
                      {signal.source}
                    </Text>
                  </View>

                  <Text style={{ color: "#b9aecb", lineHeight: 20 }}>
                    {signal.description}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </Sheet>

      <Sheet
        visible={accountSheetOpen}
        title={`Hi, ${displayName}`}
        onClose={() => setAccountSheetOpen(false)}
      >
        <View style={{ padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: colors.purple,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 12,
              }}
            >
              <Text style={{ color: colors.white, fontWeight: "900", fontSize: 20 }}>
                {currentInitial(displayName)}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "900", fontSize: 17 }}>
                {displayName}
              </Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>{email}</Text>
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.84}
            onPress={openAccount}
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Ionicons name="person-outline" size={18} color={colors.purple2} />
            <Text
              style={{
                color: colors.text,
                fontWeight: "800",
                marginLeft: 10,
              }}
            >
              Manage Account
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.84}
            onPress={() => void handleLogout()}
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Ionicons name="log-out-outline" size={18} color={colors.red} />
            <Text
              style={{
                color: colors.red,
                fontWeight: "800",
                marginLeft: 10,
              }}
            >
              Sign Out
            </Text>
          </TouchableOpacity>
        </View>
      </Sheet>
    </>
  );
}