import type { NavigatorScreenParams } from "@react-navigation/native";
import type { EngineCheckpointKey } from "../api/leagues";

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
  ResetPassword:
    | {
        email?: string;
        token?: string;
      }
    | undefined;
  Leagues: undefined;
  CreateLeague:
    | {
        demo?: boolean;
        demoCheckpointKey?: EngineCheckpointKey;
      }
    | undefined;
  Account: undefined;
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