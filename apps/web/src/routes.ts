import { createBrowserRouter } from "react-router";
import HomePage from './pages/HomePage';
import Signup from './pages/Signup';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';




export const router = createBrowserRouter([
  { path: "/", Component: HomePage,  },
  { path: "signup", Component: Signup },
  { path: "/login", Component: Login },
  { path: "/forgot-password", Component: ForgotPassword },
]);

