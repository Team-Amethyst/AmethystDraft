import type { StyleProp, ViewStyle } from "react-native";
import { Text, TouchableOpacity } from "react-native";

type Tone = "default" | "primary" | "danger" | "info";

type Props = {
  label: string;
  selected?: boolean;
  fullWidth?: boolean;
  tone?: Tone;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

function getColors(selected: boolean, tone: Tone) {
  if (!selected) {
    if (tone === "danger") {
      return {
        borderColor: "#fecaca",
        backgroundColor: "#fff1f2",
        textColor: "#991b1b",
      };
    }

    if (tone === "info") {
      return {
        borderColor: "#bfdbfe",
        backgroundColor: "#eff6ff",
        textColor: "#1d4ed8",
      };
    }

    return {
      borderColor: "#d1d5db",
      backgroundColor: "white",
      textColor: "#111827",
    };
  }

  if (tone === "danger") {
    return {
      borderColor: "#991b1b",
      backgroundColor: "#991b1b",
      textColor: "white",
    };
  }

  if (tone === "info") {
    return {
      borderColor: "#1d4ed8",
      backgroundColor: "#1d4ed8",
      textColor: "white",
    };
  }

  return {
    borderColor: "#111827",
    backgroundColor: "#111827",
    textColor: "white",
  };
}

export default function AppChip({
  label,
  selected = false,
  fullWidth = false,
  tone = "default",
  onPress,
  style,
}: Props) {
  const colors = getColors(selected, tone);

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.borderColor,
          backgroundColor: colors.backgroundColor,
          alignItems: "center",
        },
        fullWidth ? { width: "100%" } : null,
        style,
      ]}
    >
      <Text style={{ color: colors.textColor, fontWeight: "600" }}>{label}</Text>
    </TouchableOpacity>
  );
}