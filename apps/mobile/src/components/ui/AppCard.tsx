import type { PropsWithChildren } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";

type Props = PropsWithChildren<{
  backgroundColor?: string;
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
}>;

export default function AppCard({
  children,
  backgroundColor = "white",
  borderColor = "#e5e7eb",
  style,
}: Props) {
  return (
    <View
      style={[
        {
          borderWidth: 1,
          borderColor,
          borderRadius: 12,
          padding: 14,
          backgroundColor,
          marginBottom: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}