import { createBrowserRouter } from "react-router";
import HomePage from './pages/HomePage';
import Signup from './pages/Signup';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import Leagues from './pages/Leagues';
import Research from './pages/Research';
import CommandCenter from "./pages/CommandCenter";
import MyDraft from "./pages/MyDraft";





export const router = createBrowserRouter([
  { path: "/", Component: HomePage,  },
  { path: "signup", Component: Signup },
  { path: "/login", Component: Login },
  { path: "/forgot-password", Component: ForgotPassword },
  { path: "/leagues", Component: Leagues },
  { path: "/research", Component: Research },
  { path: "/my-draft", Component: MyDraft },
  { path: "/command-center", Component: CommandCenter },

]);

