import type { PropsWithChildren } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";
import { colors } from "../../theme/colors";

type Props = PropsWithChildren<{
  backgroundColor?: string;
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
}>;

export default function AppCard({
  children,
  backgroundColor = colors.surface,
  borderColor = colors.border,
  style,
}: Props) {
  return (
    <View
      style={[
        {
          borderWidth: 1,
          borderColor,
          borderRadius: 18,
          padding: 14,
          backgroundColor,
          marginBottom: 12,
          shadowColor: "#000",
          shadowOpacity: 0.16,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 8 },
          elevation: 2,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}