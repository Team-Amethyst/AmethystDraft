import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { resetPassword } from "../api/auth";
import AppButton from "../components/ui/AppButton";
import AppTextInput from "../components/ui/AppTextInput";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "ResetPassword">;

export default function ResetPasswordScreen({ navigation, route }: Props) {
  const [email, setEmail] = useState(route.params?.email ?? "");
  const [token, setToken] = useState(route.params?.token ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleResetPassword() {
    const cleanEmail = email.trim();
    const cleanToken = token.trim();

    if (!cleanEmail || !cleanToken) {
      Alert.alert("Missing reset link info", "Email and reset token are required.");
      return;
    }

    if (!password || !confirmPassword) {
      Alert.alert("Missing password", "Please enter and confirm your new password.");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Passwords do not match", "Please retype the same password.");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Password too short", "Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      await resetPassword(cleanEmail, cleanToken, password);

      Alert.alert(
        "Password reset",
        "Your password was reset successfully. Please sign in.",
        [{ text: "OK", onPress: () => navigation.navigate("Login") }],
      );
    } catch (err) {
      Alert.alert(
        "Reset failed",
        err instanceof Error ? err.message : "Password reset failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: 22,
            paddingVertical: 36,
          }}
        >
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation.navigate("Login")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 26,
            }}
          >
            <Ionicons name="arrow-back" size={18} color={colors.muted} />
            <Text style={{ color: colors.muted, marginLeft: 8, fontWeight: "800" }}>
              Back to sign in
            </Text>
          </TouchableOpacity>

          <View style={{ alignItems: "center", marginBottom: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 18 }}>
              <Ionicons name="flash-outline" size={24} color={colors.purple2} />
              <Text
                style={{
                  color: colors.text,
                  fontSize: 24,
                  fontWeight: "900",
                  letterSpacing: 4,
                  marginLeft: 8,
                }}
              >
                DRAFTROOM
              </Text>
            </View>

            <Text
              style={{
                color: colors.text,
                fontSize: 34,
                fontWeight: "900",
                textAlign: "center",
              }}
            >
              Reset Password
            </Text>

            <Text
              style={{
                color: colors.muted,
                fontSize: 16,
                textAlign: "center",
                marginTop: 8,
                lineHeight: 22,
              }}
            >
              Enter the reset information from your email and choose a new password.
            </Text>
          </View>

          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              borderRadius: 24,
              padding: 18,
              shadowColor: colors.purple,
              shadowOpacity: 0.18,
              shadowRadius: 18,
              elevation: 4,
            }}
          >
            <AppTextInput
              label="Email"
              placeholder="you@email.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />

            <AppTextInput
              label="Reset token"
              placeholder="Paste token from reset link"
              value={token}
              onChangeText={setToken}
              autoCapitalize="none"
            />

            <AppTextInput
              label="New password"
              placeholder="At least 6 characters"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
            />

            <AppTextInput
              label="Confirm new password"
              placeholder="Retype password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoComplete="new-password"
            />

            <AppButton
              title={loading ? "Resetting..." : "Reset Password"}
              loading={loading}
              disabled={loading}
              onPress={() => void handleResetPassword()}
              fullWidth
              style={{ marginTop: 4, paddingVertical: 14 }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}