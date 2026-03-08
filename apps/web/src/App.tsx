import { RouterProvider } from "react-router";
import { router } from "./routes";
import { AuthProvider } from "./contexts/AuthContext";
import { LeagueProvider } from "./contexts/LeagueContext";

export default function App() {
  return (
    <AuthProvider>
      <LeagueProvider>
        <RouterProvider router={router} />
      </LeagueProvider>
    </AuthProvider>
  );
}
