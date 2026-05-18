import { useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import {
  changePassword,
  deleteAccount,
  updateProfile,
} from "../api/auth";
import AppButton from "../components/ui/AppButton";
import AppCard from "../components/ui/AppCard";
import { useAuth } from "../contexts/AuthContext";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Account">;

function inputStyle() {
  return {
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginTop: 8,
    marginBottom: 16,
  };
}

function labelStyle() {
  return {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900" as const,
    letterSpacing: 1.2,
    textTransform: "uppercase" as const,
  };
}

function firstInitial(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "U";
  return trimmed.slice(0, 1).toUpperCase();
}

export default function AccountScreen({ navigation }: Props) {
  const { user, token, login, logout } = useAuth();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const userId = useMemo(() => {
    const candidate = user as { id?: string; _id?: string } | null;
    return candidate?.id ?? candidate?._id ?? "";
  }, [user]);

  async function handleSaveProfile() {
    if (!token) return;

    const cleanDisplayName = displayName.trim();
    const cleanEmail = email.trim();

    if (!cleanDisplayName || !cleanEmail) {
      Alert.alert("Missing profile info", "Display name and email are required.");
      return;
    }

    setSavingProfile(true);

    try {
      const updatedUser = await updateProfile(
        {
          displayName: cleanDisplayName,
          email: cleanEmail,
        },
        token,
      );

      await login(token, updatedUser);
      Alert.alert("Saved", "Profile updated successfully.");
    } catch (err) {
      Alert.alert(
        "Profile update failed",
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword() {
    if (!token) return;

    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("Missing password", "Please fill out all password fields.");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Password mismatch", "New password and confirmation do not match.");
      return;
    }

    setSavingPassword(true);

    try {
      await changePassword(currentPassword, newPassword, token);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      Alert.alert("Saved", "Password changed successfully.");
    } catch (err) {
      Alert.alert(
        "Password update failed",
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setSavingPassword(false);
    }
  }

  function confirmDeleteAccount() {
    if (!token || !userId) return;

    Alert.alert(
      "Delete account?",
      "This permanently deletes your account. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void handleDeleteAccount(),
        },
      ],
    );
  }

  async function handleDeleteAccount() {
    if (!token || !userId) return;

    setDeleting(true);

    try {
      await deleteAccount(userId, token);
      await logout();
    } catch (err) {
      Alert.alert(
        "Delete failed",
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          padding: 18,
          paddingBottom: 36,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.82}
          onPress={() => navigation.goBack()}
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          <Ionicons name="arrow-back" size={20} color={colors.muted} />
          <Text style={{ color: colors.muted, marginLeft: 8, fontSize: 16 }}>
            Back
          </Text>
        </TouchableOpacity>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 28,
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: colors.purple,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 14,
            }}
          >
            <Text style={{ color: colors.white, fontSize: 24, fontWeight: "900" }}>
              {firstInitial(user?.displayName ?? "")}
            </Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 25, fontWeight: "900" }}>
              {user?.displayName ?? "Account"}
            </Text>
            <Text style={{ color: colors.muted, marginTop: 4 }}>
              {user?.email ?? ""}
            </Text>
            {user?.createdAt ? (
              <Text style={{ color: colors.muted, marginTop: 4 }}>
                Member since {new Date(user.createdAt).toLocaleDateString()}
              </Text>
            ) : null}
          </View>
        </View>

        <AppCard backgroundColor={colors.surface} borderColor={colors.border}>
          <Text
            style={{
              color: colors.purple2,
              fontSize: 13,
              fontWeight: "900",
              letterSpacing: 1.4,
              textTransform: "uppercase",
              marginBottom: 18,
            }}
          >
            Profile
          </Text>

          <Text style={labelStyle()}>Display Name</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Display name"
            placeholderTextColor={colors.muted}
            style={inputStyle()}
          />

          <Text style={labelStyle()}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            style={inputStyle()}
          />

          <AppButton
            title={savingProfile ? "Saving..." : "Save Changes"}
            disabled={savingProfile}
            onPress={() => void handleSaveProfile()}
          />
        </AppCard>

        <AppCard backgroundColor={colors.surface} borderColor={colors.border}>
          <Text
            style={{
              color: colors.purple2,
              fontSize: 13,
              fontWeight: "900",
              letterSpacing: 1.4,
              textTransform: "uppercase",
              marginBottom: 18,
            }}
          >
            Change Password
          </Text>

          <Text style={labelStyle()}>Current Password</Text>
          <TextInput
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            placeholderTextColor={colors.muted}
            style={inputStyle()}
          />

          <Text style={labelStyle()}>New Password</Text>
          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            placeholderTextColor={colors.muted}
            style={inputStyle()}
          />

          <Text style={labelStyle()}>Confirm New Password</Text>
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            placeholderTextColor={colors.muted}
            style={inputStyle()}
          />

          <AppButton
            title={savingPassword ? "Updating..." : "Update Password"}
            disabled={savingPassword}
            onPress={() => void handleChangePassword()}
          />
        </AppCard>

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingTop: 18,
            marginTop: 8,
            flexDirection: "row",
            flexWrap: "wrap",
          }}
        >
          <AppButton
            title="Sign Out"
            variant="secondary"
            style={{ marginRight: 10, marginBottom: 10 }}
            onPress={() => void logout()}
          />

          <AppButton
            title={deleting ? "Deleting..." : "Delete Account"}
            variant="danger"
            disabled={deleting}
            onPress={confirmDeleteAccount}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}