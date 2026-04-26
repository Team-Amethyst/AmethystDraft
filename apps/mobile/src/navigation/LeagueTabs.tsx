import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import ResearchScreen from "../screens/ResearchScreen";
import MyDraftScreen from "../screens/MyDraftScreen";
import CommandCenterScreen from "../screens/CommandCenterScreen";
import type { LeagueTabParamList, RootStackParamList } from "./types";

type Props = NativeStackScreenProps<RootStackParamList, "LeagueTabs">;

const Tab = createBottomTabNavigator<LeagueTabParamList>();

export default function LeagueTabs({ route }: Props) {
  const { leagueId } = route.params;

  return (
    <Tab.Navigator>
      <Tab.Screen
        name="Research"
        component={ResearchScreen}
        initialParams={{ leagueId }}
      />
      <Tab.Screen
        name="MyDraft"
        component={MyDraftScreen}
        initialParams={{ leagueId }}
      />
      <Tab.Screen
        name="CommandCenter"
        component={CommandCenterScreen}
        initialParams={{ leagueId }}
      />
    </Tab.Navigator>
  );
}