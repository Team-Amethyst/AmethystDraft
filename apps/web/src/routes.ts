import { createBrowserRouter, Navigate } from "react-router";
import HomePage from './pages/HomePage';
import Signup from './pages/Signup';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import Leagues from './pages/Leagues';
import LeagueCreate from './pages/LeaguesCreate';
import JoinLeague from "./pages/JoinLeague";
import LeagueLayout from './components/LeagueLayout';
import LeagueSettings from './pages/LeagueSettings';
import MyDraft from './pages/MyDraft';
import CommandCenter from './pages/CommandCenter';
import Research from './pages/Research';

export const router = createBrowserRouter([
  { path: "/", Component: HomePage },
  { path: "/signup", Component: Signup },
  { path: "/login", Component: Login },
  { path: "/forgot-password", Component: ForgotPassword },
  { path: "/leagues", Component: Leagues },
  { path: "/leagues/create", Component: LeagueCreate },
  { path: "/leagues/join", Component: JoinLeague },
  {
    path: "/leagues/:id",
    Component: LeagueLayout,
    children: [
      { index: true, element: <Navigate to="research" replace /> },
      { path: "research", Component: Research },
      { path: "my-draft", Component: MyDraft },
      { path: "command-center", Component: CommandCenter },
      { path: "settings", Component: LeagueSettings },
    ],
  },
]);

