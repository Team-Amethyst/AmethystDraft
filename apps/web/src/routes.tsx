import { createBrowserRouter, Navigate } from "react-router";
import HomePage from "./pages/HomePage";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Account from "./pages/Account";
import Leagues from "./pages/Leagues";
import LeagueCreate from "./pages/LeaguesCreate";
import LeagueLayout from "./components/LeagueLayout";
import LeagueSettings from "./pages/LeagueSettings";
import LeagueKeepers from "./pages/LeagueKeepers";
import LeagueOverview from "./pages/LeagueOverview";
import MyDraft from "./pages/MyDraft";
import CommandCenter from "./pages/CommandCenter";
import Research from "./pages/Research";
import MockDraftPage from "./pages/MockDraftPage";
import TaxiDraft from "./pages/TaxiDraft";

const devOnlyRoutes = import.meta.env.DEV
  ? [
      {
        path: "/dev/player-detail-layout-mocks",
        lazy: () =>
          import("./pages/dev/PlayerDetailLayoutMocksPage").then((m) => ({
            Component: m.default,
          })),
      },
      {
        path: "/dev/player-detail-modal-mock",
        lazy: () =>
          import("./pages/dev/PlayerDetailModalMockPage").then((m) => ({
            Component: m.default,
          })),
      },
      {
        path: "/dev/player-detail-modal-design",
        lazy: () =>
          import("./pages/dev/PlayerDetailModalDesignMockPage").then((m) => ({
            Component: m.default,
          })),
      },
      {
        path: "/dev/depth-charts-design",
        lazy: () =>
          import("./pages/dev/DepthChartsDesignMockPage").then((m) => ({
            Component: m.default,
          })),
      },
    ]
  : [];

export const router = createBrowserRouter([
  { path: "/", Component: HomePage },
  { path: "/signup", Component: Signup },
  { path: "/login", Component: Login },
  { path: "/forgot-password", Component: ForgotPassword },
  { path: "/reset-password", Component: ResetPassword },
  { path: "/account", Component: Account },
  { path: "/leagues", Component: Leagues },
  { path: "/leagues/create", Component: LeagueCreate },
  {
    path: "/leagues/:id",
    Component: LeagueLayout,
    children: [
      { index: true, element: <Navigate to="research" replace /> },
      { path: "research", Component: Research },
      { path: "my-draft", Component: MyDraft },
      { path: "command-center", Component: CommandCenter },
      { path: "overview", Component: LeagueOverview },
      { path: "taxi-draft", Component: TaxiDraft },
      { path: "settings", Component: LeagueSettings },
      { path: "keepers", Component: LeagueKeepers },
      { path: "mock-draft", Component: MockDraftPage },
    ],
  },
  ...devOnlyRoutes,
]);
