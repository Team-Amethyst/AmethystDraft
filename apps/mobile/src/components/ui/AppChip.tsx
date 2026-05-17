import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import { Text, TouchableOpacity } from "react-native";
import { colors } from "../../theme/colors";

type ChipTone = "default" | "info" | "success" | "danger";

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: ChipTone;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  fullWidth?: boolean;
  disabled?: boolean;
};

function chipColors(selected: boolean, tone: ChipTone) {
  if (selected) {
    if (tone === "danger") {
      return {
        backgroundColor: "#ef4444",
        borderColor: "#f87171",
        textColor: "#ffffff",
      };
    }

    if (tone === "success") {
      return {
        backgroundColor: "#16a34a",
        borderColor: "#22c55e",
        textColor: "#ffffff",
      };
    }

    return {
      backgroundColor: colors.purple,
      borderColor: colors.purple2,
      textColor: "#ffffff",
    };
  }

  if (tone === "danger") {
    return {
      backgroundColor: "#1b1428",
      borderColor: "#7f1d1d",
      textColor: "#fecaca",
    };
  }

  if (tone === "success") {
    return {
      backgroundColor: "#10251a",
      borderColor: "#166534",
      textColor: "#bbf7d0",
    };
  }

  return {
    backgroundColor: "#1b1428",
    borderColor: "#4c3575",
    textColor: "#e5e7eb",
  };
}

export default function AppChip({
  label,
  selected = false,
  onPress,
  tone = "default",
  style,
  textStyle,
  fullWidth = false,
  disabled = false,
}: Props) {
  const palette = chipColors(selected, tone);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={[
        {
          minHeight: 36,
          paddingHorizontal: 13,
          paddingVertical: 8,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: palette.borderColor,
          backgroundColor: palette.backgroundColor,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.55 : 1,
          alignSelf: fullWidth ? "stretch" : "flex-start",
          flex: fullWidth ? 1 : undefined,
        },
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          {
            color: palette.textColor,
            fontSize: 13,
            fontWeight: "800",
          },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}