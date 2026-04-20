import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import ResearchScreen from "../screens/ResearchScreen";
import MyDraftScreen from "../screens/MyDraftScreen";
import CommandCenterScreen from "../screens/CommandCenterScreen";

export type LeagueTabParamList = {
  Research: { leagueId: string };
  MyDraft: { leagueId: string };
  CommandCenter: { leagueId: string };
};

const Tab = createBottomTabNavigator<LeagueTabParamList>();

export default function LeagueTabs({ route }: any) {
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