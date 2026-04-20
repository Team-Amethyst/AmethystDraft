import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { Player } from "../types/player";

interface SelectedPlayerContextType {
  selectedPlayer: Player | null;
  setSelectedPlayer: (player: Player | null) => void;
}

const SelectedPlayerContext = createContext<SelectedPlayerContextType | null>(
  null,
);

export function SelectedPlayerProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  return (
    <SelectedPlayerContext.Provider
      value={{ selectedPlayer, setSelectedPlayer }}
    >
      {children}
    </SelectedPlayerContext.Provider>
  );
}

export function useSelectedPlayer(): SelectedPlayerContextType {
  const context = useContext(SelectedPlayerContext);

  if (!context) {
    throw new Error(
      "useSelectedPlayer must be used within a SelectedPlayerProvider",
    );
  }

  return context;
}