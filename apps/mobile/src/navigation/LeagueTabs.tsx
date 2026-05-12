import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import ResearchScreen from "../screens/ResearchScreen";
import MyDraftScreen from "../screens/MyDraftScreen";
import CommandCenterScreen from "../screens/CommandCenterScreen";
import LeagueOverviewScreen from "../screens/LeagueOverviewScreen";
import TaxiDraftScreen from "../screens/TaxiDraftScreen";
import MockDraftScreen from "../screens/MockDraftScreen";
import IntelligenceAlertsScreen from "../screens/IntelligenceAlertsScreen";
import type { LeagueTabParamList, RootStackParamList } from "./types";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "LeagueTabs">;

const Tab = createBottomTabNavigator<LeagueTabParamList>();

export default function LeagueTabs({ route }: Props) {
  const { leagueId } = route.params;

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.purple2,
        tabBarInactiveTintColor: "#a1a1aa",
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
        },
        headerStyle: {
          backgroundColor: colors.bg,
        },
        headerTintColor: colors.text,
      }}
    >
      <Tab.Screen
        name="Research"
        component={ResearchScreen}
        initialParams={{ leagueId }}
      />
      <Tab.Screen
        name="MyDraft"
        component={MyDraftScreen}
        initialParams={{ leagueId }}
        options={{ title: "Draft" }}
      />
      <Tab.Screen
        name="CommandCenter"
        component={CommandCenterScreen}
        initialParams={{ leagueId }}
        options={{ title: "Command" }}
      />
      <Tab.Screen
        name="Overview"
        component={LeagueOverviewScreen}
        initialParams={{ leagueId }}
      />
      <Tab.Screen
        name="TaxiDraft"
        component={TaxiDraftScreen}
        initialParams={{ leagueId }}
        options={{ title: "Taxi" }}
      />
      <Tab.Screen
        name="MockDraft"
        component={MockDraftScreen}
        initialParams={{ leagueId }}
        options={{ title: "Mock" }}
      />
      <Tab.Screen
        name="Alerts"
        component={IntelligenceAlertsScreen}
        initialParams={{ leagueId }}
      />
    </Tab.Navigator>
  );
}