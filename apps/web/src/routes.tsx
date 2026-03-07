import { createBrowserRouter, Navigate } from "react-router";
import HomePage from "./pages/HomePage";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import Account from "./pages/Account";
import Leagues from "./pages/Leagues";
import LeagueCreate from "./pages/LeaguesCreate";
import LeagueLayout from "./components/LeagueLayout";
import LeagueSettings from "./pages/LeagueSettings";
import LeagueOverview from "./pages/LeagueOverview";
import MyDraft from "./pages/MyDraft";
import CommandCenter from "./pages/CommandCenter";
import Research from "./pages/Research";

export const router = createBrowserRouter([
  { path: "/", Component: HomePage },
  { path: "/signup", Component: Signup },
  { path: "/login", Component: Login },
  { path: "/forgot-password", Component: ForgotPassword },
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
      { path: "settings", Component: LeagueSettings },
    ],
  },
]);
