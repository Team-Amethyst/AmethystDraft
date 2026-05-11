import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ValuationUiAlert } from "../domain/valuationAlerts";

const MAX_STORED = 5;

type ValuationBoardAlertsContextValue = {
  /** Latest board-derived valuation notices (capped) for the navbar bell. */
  boardValuationAlerts: readonly ValuationUiAlert[];
  /** Replace with the latest normalized alerts from the active draft surface. */
  publishBoardValuationAlerts: (alerts: readonly ValuationUiAlert[]) => void;
  clearBoardValuationAlerts: () => void;
};

const ValuationBoardAlertsContext =
  createContext<ValuationBoardAlertsContextValue | null>(null);

export function ValuationBoardAlertsProvider({ children }: { children: ReactNode }) {
  const [boardValuationAlerts, setBoard] = useState<readonly ValuationUiAlert[]>(
    [],
  );

  const publishBoardValuationAlerts = useCallback(
    (alerts: readonly ValuationUiAlert[]) => {
      setBoard(alerts.slice(0, MAX_STORED));
    },
    [],
  );

  const clearBoardValuationAlerts = useCallback(() => {
    setBoard([]);
  }, []);

  const value = useMemo(
    () => ({
      boardValuationAlerts,
      publishBoardValuationAlerts,
      clearBoardValuationAlerts,
    }),
    [boardValuationAlerts, publishBoardValuationAlerts, clearBoardValuationAlerts],
  );

  return (
    <ValuationBoardAlertsContext.Provider value={value}>
      {children}
    </ValuationBoardAlertsContext.Provider>
  );
}

export function useValuationBoardAlerts(): ValuationBoardAlertsContextValue {
  const ctx = useContext(ValuationBoardAlertsContext);
  if (!ctx) {
    throw new Error(
      "useValuationBoardAlerts must be used within ValuationBoardAlertsProvider",
    );
  }
  return ctx;
}
