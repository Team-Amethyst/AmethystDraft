import type { StyleProp, ViewStyle } from "react-native";
import { Text, TouchableOpacity } from "react-native";
import { colors } from "../../theme/colors";

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
        borderColor: "#7f1d1d",
        backgroundColor: "#2a1218",
        textColor: "#fecaca",
      };
    }

    if (tone === "info") {
      return {
        borderColor: "#4338ca",
        backgroundColor: "#15162b",
        textColor: "#c7d2fe",
      };
    }

    return {
      borderColor: colors.border,
      backgroundColor: colors.surface2,
      textColor: colors.text,
    };
  }

  if (tone === "danger") {
    return {
      borderColor: colors.red,
      backgroundColor: colors.red,
      textColor: colors.white,
    };
  }

  if (tone === "info") {
    return {
      borderColor: colors.purple,
      backgroundColor: colors.purple,
      textColor: colors.white,
    };
  }

  return {
    borderColor: colors.purple2,
    backgroundColor: colors.purple,
    textColor: colors.white,
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
  const chipColors = getColors(selected, tone);

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: chipColors.borderColor,
          backgroundColor: chipColors.backgroundColor,
          alignItems: "center",
        },
        fullWidth ? { width: "100%" } : null,
        style,
      ]}
    >
      <Text style={{ color: chipColors.textColor, fontWeight: "700" }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}