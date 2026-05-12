import type { NavigatorScreenParams } from "@react-navigation/native";

export type LeagueTabParamList = {
  Research: { leagueId: string };
  MyDraft: { leagueId: string };
  CommandCenter: { leagueId: string };
  Overview: { leagueId: string };
  TaxiDraft: { leagueId: string };
  MockDraft: { leagueId: string };
  Alerts: { leagueId: string };
};

export type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
  Leagues: undefined;
  CreateLeague: undefined;
  LeagueSettings: {
    leagueId: string;
    leagueName: string;
  };
  KeeperSettings: {
    leagueId: string;
    leagueName: string;
  };
  LeagueTabs: NavigatorScreenParams<LeagueTabParamList> & {
    leagueId: string;
    leagueName: string;
  };
};