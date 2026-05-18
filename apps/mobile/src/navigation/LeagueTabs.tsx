import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LeagueHeaderActions from "../components/shell/LeagueHeaderActions";
import ResearchScreen from "../screens/ResearchScreen";
import MyDraftScreen from "../screens/MyDraftScreen";
import CommandCenterScreen from "../screens/CommandCenterScreen";
import LeagueOverviewScreen from "../screens/LeagueOverviewScreen";
import TaxiDraftScreen from "../screens/TaxiDraftScreen";
import type { LeagueTabParamList, RootStackParamList } from "./types";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "LeagueTabs">;

const Tab = createBottomTabNavigator<LeagueTabParamList>();

type TabIconName =
  | "search-outline"
  | "clipboard-outline"
  | "flash-outline"
  | "bar-chart-outline"
  | "car-outline";

function tabIcon(name: TabIconName) {
  return ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name} size={size} color={color} />
  );
}

function HeaderLogo() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Ionicons name="flash-outline" size={18} color={colors.purple2} />
      <Text
        style={{
          color: colors.text,
          fontWeight: "900",
          letterSpacing: 1.4,
          marginLeft: 6,
          fontSize: 14,
        }}
      >
        DRAFTROOM
      </Text>
    </View>
  );
}

export default function LeagueTabs({ route, navigation }: Props) {
  const { leagueId, leagueName } = route.params;
  const insets = useSafeAreaInsets();

  const bottomPadding = Math.max(insets.bottom, 14);
  const tabBarHeight = 58 + bottomPadding;

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.purple2,
        tabBarInactiveTintColor: "#6f647f",
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
          height: tabBarHeight,
          paddingTop: 6,
          paddingBottom: bottomPadding,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "900",
          marginBottom: 0,
        },
        tabBarIconStyle: {
          marginTop: 2,
        },
        headerStyle: {
          backgroundColor: colors.bg,
          height: 58,
        },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerTitle: HeaderLogo,
        headerTitleAlign: "left",
        headerRight: () => (
          <LeagueHeaderActions
            leagueId={leagueId}
            leagueName={leagueName}
            navigation={navigation}
          />
        ),
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
          tabBarLabel: "2 My Draft",
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
          tabBarLabel: "5 Taxi Draft",
          title: "Taxi Draft",
          tabBarIcon: tabIcon("car-outline"),
        }}
      />
    </Tab.Navigator>
  );
}