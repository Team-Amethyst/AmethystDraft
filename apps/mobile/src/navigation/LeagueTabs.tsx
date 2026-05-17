import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
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

type TabIconName =
  | "search-outline"
  | "clipboard-outline"
  | "flash-outline"
  | "bar-chart-outline"
  | "car-outline"
  | "game-controller-outline"
  | "notifications-outline";

function tabIcon(name: TabIconName) {
  return ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name} size={size} color={color} />
  );
}

export default function LeagueTabs({ route }: Props) {
  const { leagueId, leagueName } = route.params;

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.purple2,
        tabBarInactiveTintColor: "#a1a1aa",
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
          height: 68,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "800",
        },
        tabBarIconStyle: {
          marginTop: 2,
        },
        headerStyle: {
          backgroundColor: colors.bg,
        },
        headerTintColor: colors.text,
        headerTitle: leagueName,
      }}
    >
      <Tab.Screen
        name="Research"
        component={ResearchScreen}
        initialParams={{ leagueId }}
        options={{
          tabBarLabel: "1 Research",
          title: "Research",
          tabBarIcon: tabIcon("search-outline"),
        }}
      />

      <Tab.Screen
        name="MyDraft"
        component={MyDraftScreen}
        initialParams={{ leagueId }}
        options={{
          tabBarLabel: "2 Draft",
          title: "My Draft",
          tabBarIcon: tabIcon("clipboard-outline"),
        }}
      />

      <Tab.Screen
        name="CommandCenter"
        component={CommandCenterScreen}
        initialParams={{ leagueId }}
        options={{
          tabBarLabel: "3 Command",
          title: "Command Center",
          tabBarIcon: tabIcon("flash-outline"),
        }}
      />

      <Tab.Screen
        name="Overview"
        component={LeagueOverviewScreen}
        initialParams={{ leagueId }}
        options={{
          tabBarLabel: "4 Overview",
          title: "Overview",
          tabBarIcon: tabIcon("bar-chart-outline"),
        }}
      />

      <Tab.Screen
        name="TaxiDraft"
        component={TaxiDraftScreen}
        initialParams={{ leagueId }}
        options={{
          tabBarLabel: "5 Taxi",
          title: "Taxi Draft",
          tabBarIcon: tabIcon("car-outline"),
        }}
      />

      <Tab.Screen
        name="MockDraft"
        component={MockDraftScreen}
        initialParams={{ leagueId }}
        options={{
          tabBarLabel: "6 Mock",
          title: "Mock Draft",
          tabBarIcon: tabIcon("game-controller-outline"),
        }}
      />

      <Tab.Screen
        name="Alerts"
        component={IntelligenceAlertsScreen}
        initialParams={{ leagueId }}
        options={{
          tabBarLabel: "7 Alerts",
          title: "Alerts",
          tabBarIcon: tabIcon("notifications-outline"),
        }}
      />
    </Tab.Navigator>
  );
}