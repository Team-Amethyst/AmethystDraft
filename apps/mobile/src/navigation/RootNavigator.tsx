import { ActivityIndicator, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../contexts/AuthContext";
import LoginScreen from "../screens/LoginScreen";
import SignupScreen from "../screens/SignupScreen";
import ForgotPasswordScreen from "../screens/ForgotPasswordScreen";
import ResetPasswordScreen from "../screens/ResetPasswordScreen";
import LeaguesScreen from "../screens/LeaguesScreen";
import CreateLeagueScreen from "../screens/CreateLeagueScreen";
import LeagueSettingsScreen from "../screens/LeagueSettingsScreen";
import KeeperSettingsScreen from "../screens/KeeperSettingsScreen";
import AccountScreen from "../screens/AccountScreen";
import LeagueTabs from "./LeagueTabs";
import type { RootStackParamList } from "./types";
import { colors } from "../theme/colors";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator color={colors.purple2} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      {!isAuthenticated ? (
        <>
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />

          <Stack.Screen
            name="Signup"
            component={SignupScreen}
            options={{ headerShown: false }}
          />

          <Stack.Screen
            name="ForgotPassword"
            component={ForgotPasswordScreen}
            options={{ headerShown: false }}
          />

          <Stack.Screen
            name="ResetPassword"
            component={ResetPasswordScreen}
            options={{ headerShown: false }}
          />
        </>
      ) : (
        <>
          <Stack.Screen name="Leagues" component={LeaguesScreen} />

          <Stack.Screen name="CreateLeague" component={CreateLeagueScreen} />

          <Stack.Screen
            name="Account"
            component={AccountScreen}
            options={{ headerShown: false }}
          />

          <Stack.Screen
            name="LeagueSettings"
            component={LeagueSettingsScreen}
            options={({ route }) => ({
              title: `${route.params.leagueName} Settings`,
            })}
          />

          <Stack.Screen
            name="KeeperSettings"
            component={KeeperSettingsScreen}
            options={({ route }) => ({
              title: `${route.params.leagueName} Keepers`,
            })}
          />

          <Stack.Screen
            name="LeagueTabs"
            component={LeagueTabs}
            options={{ headerShown: false }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}