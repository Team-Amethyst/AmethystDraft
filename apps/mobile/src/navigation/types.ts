import type { NavigatorScreenParams } from "@react-navigation/native";

export type LeagueTabParamList = {
  Research: { leagueId: string };
  MyDraft: { leagueId: string };
  CommandCenter: { leagueId: string };
};

export type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  Leagues: undefined;
  CreateLeague: undefined;
  LeagueTabs: NavigatorScreenParams<LeagueTabParamList> & {
    leagueId: string;
    leagueName: string;
  };
};