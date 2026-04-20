import "react-native-gesture-handler";
import "react-native-url-polyfill/auto";

import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/contexts/AuthContext";
import { LeagueProvider } from "./src/contexts/LeagueContext";
import RootNavigator from "./src/navigation/RootNavigator";

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <LeagueProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </LeagueProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}