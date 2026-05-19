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
import { registerUser } from "../api/auth";
import AppButton from "../components/ui/AppButton";
import AppTextInput from "../components/ui/AppTextInput";
import { useAuth } from "../contexts/AuthContext";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Signup">;

export default function SignupScreen({ navigation }: Props) {
  const { login } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    const cleanName = displayName.trim();
    const cleanEmail = email.trim();

    if (!cleanName || !cleanEmail || !password) {
      Alert.alert("Missing info", "Please enter your name, email, and password.");
      return;
    }

    if (password !== confirm) {
      Alert.alert("Passwords do not match", "Please retype the same password.");
      return;
    }

    if (password.length < 8) {
      Alert.alert("Password too short", "Use at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      const data = await registerUser(cleanName, cleanEmail, password);
      await login(data.token, data.user);
    } catch (err) {
      Alert.alert(
        "Signup failed",
        err instanceof Error ? err.message : "Something went wrong.",
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
              Back to login
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
              Create Account
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
              Set up your draft room in 60 seconds.
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
              label="Display Name"
              placeholder="Your name"
              value={displayName}
              onChangeText={setDisplayName}
              autoComplete="name"
            />

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
              label="Password"
              placeholder="At least 8 characters"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
            />

            <AppTextInput
              label="Confirm Password"
              placeholder="Retype password"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoComplete="new-password"
            />

            <AppButton
              title={loading ? "Creating account..." : "Create Account"}
              loading={loading}
              disabled={loading}
              onPress={() => void handleSignup()}
              fullWidth
              style={{ marginTop: 4, paddingVertical: 14 }}
            />
          </View>

          <View
            style={{
              alignItems: "center",
              marginTop: 22,
              flexDirection: "row",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: colors.muted }}>Already have an account? </Text>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate("Login")}
            >
              <Text style={{ color: colors.purple2, fontWeight: "900" }}>
                Sign in
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}