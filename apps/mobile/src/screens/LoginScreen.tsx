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
import { loginUser } from "../api/auth";
import AppButton from "../components/ui/AppButton";
import AppTextInput from "../components/ui/AppTextInput";
import { useAuth } from "../contexts/AuthContext";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

function DraftroomLogo() {
  return (
    <View style={{ alignItems: "center", marginBottom: 28 }}>
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
          fontSize: 36,
          fontWeight: "900",
          textAlign: "center",
        }}
      >
        Sign In
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
        Enter your credentials to access your fantasy baseball draft room.
      </Text>
    </View>
  );
}

export default function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      Alert.alert("Missing login info", "Please enter both email and password.");
      return;
    }

    setLoading(true);

    try {
      const data = await loginUser(cleanEmail, password);
      await login(data.token, data.user);
    } catch (err) {
      Alert.alert(
        "Login failed",
        err instanceof Error ? err.message : "Something went wrong",
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
          <View
            style={{
              position: "absolute",
              top: 80,
              left: 24,
              width: 140,
              height: 140,
              borderRadius: 70,
              backgroundColor: "#3b1d56",
              opacity: 0.28,
            }}
          />

          <View
            style={{
              position: "absolute",
              bottom: 120,
              right: 12,
              width: 190,
              height: 190,
              borderRadius: 95,
              backgroundColor: "#1e3a8a",
              opacity: 0.14,
            }}
          />

          <DraftroomLogo />

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
              label="Password"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
            />

            <AppButton
              title={loading ? "Signing in..." : "Sign In"}
              loading={loading}
              disabled={loading}
              onPress={() => void handleLogin()}
              fullWidth
              style={{ marginTop: 4, paddingVertical: 14 }}
            />

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate("ForgotPassword")}
              style={{ alignItems: "center", marginTop: 16 }}
            >
              <Text style={{ color: colors.purple2, fontWeight: "800" }}>
                Forgot password?
              </Text>
            </TouchableOpacity>
          </View>

          <View
            style={{
              alignItems: "center",
              marginTop: 22,
              flexDirection: "row",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: colors.muted }}>Don&apos;t have an account? </Text>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate("Signup")}
            >
              <Text style={{ color: colors.purple2, fontWeight: "900" }}>
                Create one
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}