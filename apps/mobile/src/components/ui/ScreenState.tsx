import { ActivityIndicator, Text, View } from "react-native";
import { colors } from "../../theme/colors";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 24 }}>
      <ActivityIndicator color={colors.purple2} />
      <Text style={{ marginTop: 10, color: colors.muted }}>{label}</Text>
    </View>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        padding: 16,
        backgroundColor: colors.surface2,
      }}
    >
      <Text style={{ color: colors.muted }}>{label}</Text>
    </View>
  );
}

export function ErrorState({ label }: { label: string }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: "#7f1d1d",
        borderRadius: 14,
        padding: 14,
        backgroundColor: "#2a1218",
        marginBottom: 12,
      }}
    >
      <Text style={{ color: "#fecaca" }}>{label}</Text>
    </View>
  );
}