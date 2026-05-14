import type { PropsWithChildren } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { ActivityIndicator, Text, TouchableOpacity } from "react-native";
import { colors } from "../../theme/colors";

type Variant = "primary" | "secondary" | "danger" | "ghost";

type Props = PropsWithChildren<{
  title?: string;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress: () => void;
}>;

function getStyle(variant: Variant) {
  if (variant === "secondary") {
    return {
      backgroundColor: colors.surface2,
      borderColor: colors.border,
      textColor: colors.text,
    };
  }

  if (variant === "danger") {
    return {
      backgroundColor: "#7f1d1d",
      borderColor: colors.red,
      textColor: "#fee2e2",
    };
  }

  if (variant === "ghost") {
    return {
      backgroundColor: "transparent",
      borderColor: colors.border,
      textColor: colors.purple2,
    };
  }

  return {
    backgroundColor: colors.purple,
    borderColor: colors.purple2,
    textColor: colors.white,
  };
}

export default function AppButton({
  title,
  children,
  variant = "primary",
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  onPress,
}: Props) {
  const buttonStyle = getStyle(variant);
  const inactive = disabled || loading;

  return (
    <TouchableOpacity
      disabled={inactive}
      onPress={onPress}
      activeOpacity={0.82}
      style={[
        {
          borderWidth: 1,
          borderColor: buttonStyle.borderColor,
          backgroundColor: inactive ? "#272033" : buttonStyle.backgroundColor,
          borderRadius: 14,
          paddingVertical: 12,
          paddingHorizontal: 14,
          alignItems: "center",
          justifyContent: "center",
          opacity: inactive ? 0.65 : 1,
        },
        fullWidth ? { width: "100%" } : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={buttonStyle.textColor} />
      ) : (
        <Text style={{ color: buttonStyle.textColor, fontWeight: "800" }}>
          {title ?? children}
        </Text>
      )}
    </TouchableOpacity>
  );
}