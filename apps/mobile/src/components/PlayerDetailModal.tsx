import {
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AppButton from "./ui/AppButton";
import AppCard from "./ui/AppCard";
import { colors } from "../theme/colors";
import type { Player } from "../types/player";

type Props = {
  player: Player | null;
  visible: boolean;
  watched: boolean;
  custom: boolean;
  displayValue: number;
  displayTier: number;
  statSummary: string;
  onClose: () => void;
  onToggleWatchlist: () => void;
  onMoveToCommandCenter: () => void;
  onEditCustom?: () => void;
  onRemoveCustom?: () => void;
};

export default function PlayerDetailModal({
  player,
  visible,
  watched,
  custom,
  displayValue,
  displayTier,
  statSummary,
  onClose,
  onToggleWatchlist,
  onMoveToCommandCenter,
  onEditCustom,
  onRemoveCustom,
}: Props) {
  if (!player) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: "900" }}>
              Player Detail
            </Text>

            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: colors.purple2, fontWeight: "800" }}>
                Close
              </Text>
            </TouchableOpacity>
          </View>

          <AppCard>
            <Text style={{ color: colors.text, fontSize: 26, fontWeight: "900" }}>
              {player.name}
            </Text>

            <Text style={{ color: colors.muted, marginTop: 6 }}>
              {player.team} • {player.position}
              {player.positions?.length ? ` • ${player.positions.join("/")}` : ""}
            </Text>

            {custom ? (
              <Text style={{ color: colors.gold, marginTop: 8, fontWeight: "800" }}>
                Custom Player
              </Text>
            ) : null}

            {player.injuryStatus ? (
              <Text style={{ color: colors.red, marginTop: 8, fontWeight: "800" }}>
                Injury: {player.injuryStatus}
              </Text>
            ) : null}
          </AppCard>

          <AppCard>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
              Draft Value
            </Text>

            <Text style={{ color: colors.text, fontSize: 22, fontWeight: "900", marginTop: 10 }}>
              ${displayValue}
            </Text>

            <Text style={{ color: colors.muted, marginTop: 6 }}>
              Tier {displayTier} • ADP {player.adp}
            </Text>
          </AppCard>

          <AppCard>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
              Stat Snapshot
            </Text>

            <Text style={{ color: colors.muted, marginTop: 8, lineHeight: 20 }}>
              {statSummary || "No stat summary available."}
            </Text>
          </AppCard>

          {player.outlook ? (
            <AppCard>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                Outlook
              </Text>

              <Text style={{ color: colors.muted, marginTop: 8, lineHeight: 20 }}>
                {player.outlook}
              </Text>
            </AppCard>
          ) : null}

          <AppButton
            title={watched ? "Remove from Watchlist" : "Add to Watchlist"}
            variant={watched ? "secondary" : "primary"}
            onPress={onToggleWatchlist}
          />

          <View style={{ height: 10 }} />

          <AppButton
            title="Move to Command Center"
            onPress={onMoveToCommandCenter}
          />

          {custom ? (
            <>
              <View style={{ height: 10 }} />

              <AppButton
                title="Edit Custom Player"
                variant="secondary"
                onPress={onEditCustom ?? onClose}
              />

              <View style={{ height: 10 }} />

              <AppButton
                title="Remove Custom Player"
                variant="danger"
                onPress={onRemoveCustom ?? onClose}
              />
            </>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}