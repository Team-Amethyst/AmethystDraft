import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
    <SafeAreaView
      style={{
        flex: 1,
        padding: 20,
        justifyContent: "center",
        backgroundColor: colors.bg,
      }}
    >
      <Text style={{ fontSize: 32, fontWeight: "900", color: colors.text }}>
        Create Account
      </Text>

      <Text style={{ color: colors.muted, marginTop: 6, marginBottom: 24 }}>
        Join AmethystDraft and start building your draft room.
      </Text>

      <AppTextInput
        label="Display name"
        placeholder="Your name"
        value={displayName}
        onChangeText={setDisplayName}
      />

      <AppTextInput
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <AppTextInput
        label="Password"
        placeholder="At least 8 characters"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <AppTextInput
        label="Confirm password"
        placeholder="Retype password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
      />

      <AppButton
        title="Create Account"
        loading={loading}
        onPress={() => void handleSignup()}
      />

      <View style={{ height: 12 }} />

      <AppButton
        title="Back to Login"
        variant="secondary"
        onPress={() => navigation.navigate("Login")}
      />
    </SafeAreaView>
  );
}