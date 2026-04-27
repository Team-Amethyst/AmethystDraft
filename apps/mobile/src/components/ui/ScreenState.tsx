import { ActivityIndicator, Text, View } from "react-native";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 24 }}>
      <ActivityIndicator />
      <Text style={{ marginTop: 10, color: "#6b7280" }}>{label}</Text>
    </View>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: "#e5e7eb",
        borderRadius: 12,
        padding: 16,
        backgroundColor: "#fafafa",
      }}
    >
      <Text style={{ color: "#6b7280" }}>{label}</Text>
    </View>
  );
}

export function ErrorState({ label }: { label: string }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: "#fecaca",
        borderRadius: 12,
        padding: 14,
        backgroundColor: "#fef2f2",
        marginBottom: 12,
      }}
    >
      <Text style={{ color: "#b91c1c" }}>{label}</Text>
    </View>
  );
}