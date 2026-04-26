import { useState } from "react";
import {
  Alert,
  Button,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { registerUser } from "../api/auth";
import { useAuth } from "../contexts/AuthContext";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Signup">;

export default function SignupScreen({ navigation }: Props) {
  const { login } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    setLoading(true);

    try {
      const data = await registerUser(displayName, email, password);
      await login(data.token, data.user);
    } catch (err) {
      Alert.alert(
        "Sign up failed",
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, padding: 20, justifyContent: "center" }}>
      <Text style={{ fontSize: 28, fontWeight: "700", marginBottom: 20 }}>
        Create Account
      </Text>

      <TextInput
        placeholder="Display name"
        value={displayName}
        onChangeText={setDisplayName}
        style={{
          borderWidth: 1,
          borderColor: "#ccc",
          marginBottom: 12,
          padding: 12,
          borderRadius: 8,
        }}
      />

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        style={{
          borderWidth: 1,
          borderColor: "#ccc",
          marginBottom: 12,
          padding: 12,
          borderRadius: 8,
        }}
      />

      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={{
          borderWidth: 1,
          borderColor: "#ccc",
          marginBottom: 12,
          padding: 12,
          borderRadius: 8,
        }}
      />

      <Button
        title={loading ? "Creating account..." : "Create Account"}
        onPress={handleSignup}
        disabled={loading}
      />

      <View style={{ height: 12 }} />

      <Button title="Go to Login" onPress={() => navigation.navigate("Login")} />
    </SafeAreaView>
  );
}