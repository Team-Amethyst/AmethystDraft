import { useState } from "react";
import { Alert, Button, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { loginUser } from "../api/auth";
import { useAuth } from "../contexts/AuthContext";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

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
    <SafeAreaView
      style={{
        flex: 1,
        padding: 20,
        justifyContent: "center",
        backgroundColor: colors.bg,
      }}
    >
      <Text style={{ fontSize: 32, fontWeight: "900", color: colors.text }}>
        AmethystDraft
      </Text>

      <Text style={{ color: colors.muted, marginTop: 6, marginBottom: 24 }}>
        Sign in to your fantasy baseball draft room.
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

      <TextInput
        placeholder="Password"
        placeholderTextColor={colors.muted}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
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
        title={loading ? "Signing in..." : "Sign In"}
        onPress={() => void handleLogin()}
        disabled={loading}
      />

      <View style={{ height: 12 }} />

      <Button
        title="Forgot Password"
        onPress={() => navigation.navigate("ForgotPassword")}
      />

      <View style={{ height: 12 }} />

      <Button
        title="Create Account"
        onPress={() => navigation.navigate("Signup")}
      />
    </SafeAreaView>
  );
}