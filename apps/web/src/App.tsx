import { RouterProvider } from "react-router";
import { router } from "./routes";
import { AuthProvider } from "./contexts/AuthContext";
import { LeagueProvider } from "./contexts/LeagueContext";
import { ValuationBoardAlertsProvider } from "./contexts/ValuationBoardAlertsContext";

export default function App() {
  return (
    <AuthProvider>
      <LeagueProvider>
        <ValuationBoardAlertsProvider>
          <RouterProvider router={router} />
        </ValuationBoardAlertsProvider>
      </LeagueProvider>
    </AuthProvider>
  );
}
