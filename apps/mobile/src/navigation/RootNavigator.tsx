import { ActivityIndicator, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../contexts/AuthContext";
import LoginScreen from "../screens/LoginScreen";
import SignupScreen from "../screens/SignupScreen";
import LeaguesScreen from "../screens/LeaguesScreen";
import CreateLeagueScreen from "../screens/CreateLeagueScreen";
import LeagueTabs from "./LeagueTabs";

export type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  Leagues: undefined;
  CreateLeague: undefined;
  LeagueTabs: { leagueId: string; leagueName: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack.Navigator>
      {!isAuthenticated ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="Leagues" component={LeaguesScreen} />
          <Stack.Screen name="CreateLeague" component={CreateLeagueScreen} />
          <Stack.Screen
            name="LeagueTabs"
            component={LeagueTabs}
            options={({ route }) => ({
              title: route.params.leagueName,
            })}
          />
        </>
      )}
    </Stack.Navigator>
  );
}