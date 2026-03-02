import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import HomePage from './pages/HomePage';
// import { Dashboard } from "./pages/Dashboard";
// import { Rankings } from "./pages/Rankings";
// import { CheatSheet } from "./pages/CheatSheet";
// import { MockDraft } from "./pages/MockDraft";
// import { Sleepers } from "./pages/Sleepers";
// import { DraftRoom } from "./pages/DraftRoom";
// import { News } from "./pages/News";
// import { Ratings } from "./pages/Ratings";
// import { Auth } from "./pages/Auth";
// import { ForgotPassword } from "./pages/ForgotPassword";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: HomePage,  // ← swap this in temporarily
  },
  {
    path: "/old-home",
    Component: Layout,
    children: [
      { index: true, Component: Home },  // ← your old work is safe here
    ],
  },
]);

