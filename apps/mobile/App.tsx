import "react-native-gesture-handler";
import "react-native-url-polyfill/auto";

import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/contexts/AuthContext";
import { LeagueProvider } from "./src/contexts/LeagueContext";
import { PlayerNotesProvider } from "./src/contexts/PlayerNotesContext";
import { SelectedPlayerProvider } from "./src/contexts/SelectedPlayerContext";
import { WatchlistProvider } from "./src/contexts/WatchlistContext";
import RootNavigator from "./src/navigation/RootNavigator";

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <LeagueProvider>
          <SelectedPlayerProvider>
            <WatchlistProvider>
              <PlayerNotesProvider>
                <NavigationContainer>
                  <RootNavigator />
                </NavigationContainer>
              </PlayerNotesProvider>
            </WatchlistProvider>
          </SelectedPlayerProvider>
        </LeagueProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}