import { useState } from "react";
import { Alert, Button, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { forgotPassword } from "../api/auth";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "ForgotPassword">;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const cleanEmail = email.trim();

    if (!cleanEmail) {
      Alert.alert("Missing email", "Please enter your account email.");
      return;
    }

    setLoading(true);

    try {
      await forgotPassword(cleanEmail);
      Alert.alert(
        "Request sent",
        "If password reset is enabled for this account, you will receive instructions.",
        [{ text: "OK", onPress: () => navigation.navigate("Login") }],
      );
    } catch (err) {
      Alert.alert(
        "Request failed",
        err instanceof Error ? err.message : "Password reset request failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView
      style={{
        flex: 1,
        padding: 20,
        justifyContent: "center",
        backgroundColor: colors.bg,
      }}
    >
      <Text style={{ fontSize: 28, fontWeight: "800", color: colors.text, marginBottom: 8 }}>
        Forgot Password
      </Text>

      <Text style={{ color: colors.muted, marginBottom: 20 }}>
        Enter your email and we will request a reset from the Draft Kit backend.
      </Text>

      <TextInput
        placeholder="Email"
        placeholderTextColor={colors.muted}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          color: colors.text,
          marginBottom: 12,
          padding: 12,
          borderRadius: 10,
          backgroundColor: colors.surface,
        }}
      />

      <Button
        title={loading ? "Sending..." : "Send Reset Request"}
        onPress={() => void handleSubmit()}
        disabled={loading}
      />

      <View style={{ height: 12 }} />

      <Button title="Back to Login" onPress={() => navigation.navigate("Login")} />
    </SafeAreaView>
  );
}