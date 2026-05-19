import { Text, View, type ViewStyle } from "react-native";
import { positionColorStyle } from "../../constants/positionColors";

type Props = {
  pos?: string;
  position?: string;
  label?: string;
  small?: boolean;
  style?: ViewStyle;
};

export default function PositionBadge({
  pos,
  position,
  label,
  small = false,
  style,
}: Props) {
  const value = (pos ?? position ?? label ?? "").trim();

  if (!value) {
    return null;
  }

  const c = positionColorStyle(value);

  return (
    <View
      style={[
        {
          minWidth: small ? 28 : 34,
          paddingHorizontal: small ? 6 : 8,
          paddingVertical: small ? 3 : 4,
          borderRadius: 5,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.bg,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 5,
          marginBottom: 5,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: c.color,
          fontSize: small ? 10 : 11,
          fontWeight: "900",
          letterSpacing: 0.4,
        }}
      >
        {value.toUpperCase()}
      </Text>
    </View>
  );
}
