import type { TextInputProps, StyleProp, ViewStyle } from "react-native";
import { Text, TextInput, View } from "react-native";
import { colors } from "../../theme/colors";

type Props = TextInputProps & {
  label?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export default function AppTextInput({
  label,
  containerStyle,
  style,
  placeholderTextColor,
  ...props
}: Props) {
  return (
    <View style={[{ marginBottom: 12 }, containerStyle]}>
      {label ? (
        <Text style={{ color: colors.muted, marginBottom: 6, fontWeight: "700" }}>
          {label}
        </Text>
      ) : null}

      <TextInput
        placeholderTextColor={placeholderTextColor ?? colors.muted}
        style={[
          {
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            color: colors.text,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 12,
          },
          style,
        ]}
        {...props}
      />
    </View>
  );
}