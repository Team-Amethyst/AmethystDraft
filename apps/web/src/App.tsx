import { RouterProvider } from "react-router";
import { router } from "./routes";
import { WatchlistProvider } from "./contexts/WatchlistContext";
import { AuthProvider } from "./contexts/AuthContext";
import { LeagueProvider } from "./contexts/LeagueContext";

export default function App() {
  return (
    <AuthProvider>
      <LeagueProvider>
        <WatchlistProvider>
          <RouterProvider router={router} />
        </WatchlistProvider>
      </LeagueProvider>
    </AuthProvider>
  );
}
