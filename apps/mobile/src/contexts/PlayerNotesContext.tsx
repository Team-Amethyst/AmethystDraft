import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { getNotes, saveNote } from "../api/notes";

interface PlayerNotesContextType {
  getNote: (leagueId: string, playerId: string) => string;
  loadNotes: (leagueId: string) => Promise<void>;
  setNote: (leagueId: string, playerId: string, note: string) => void;
}

const PlayerNotesContext = createContext<PlayerNotesContextType | null>(null);

export function PlayerNotesProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [notesByLeague, setNotesByLeague] = useState<
    Record<string, Record<string, string>>
  >({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const getNote = useCallback(
    (leagueId: string, playerId: string) =>
      notesByLeague[leagueId]?.[playerId] ?? "",
    [notesByLeague],
  );

  const loadNotes = useCallback(
    async (leagueId: string) => {
      if (!token) return;

      const notes = await getNotes(leagueId, token);
      setNotesByLeague((prev) => ({
        ...prev,
        [leagueId]: notes,
      }));
    },
    [token],
  );

  const setNote = useCallback(
    (leagueId: string, playerId: string, note: string) => {
      setNotesByLeague((prev) => ({
        ...prev,
        [leagueId]: {
          ...(prev[leagueId] ?? {}),
          [playerId]: note,
        },
      }));

      if (!token) return;

      const key = `${leagueId}:${playerId}`;
      clearTimeout(timers.current[key]);

      timers.current[key] = setTimeout(() => {
        saveNote(leagueId, playerId, note, token).catch(console.error);
      }, 600);
    },
    [token],
  );

  return (
    <PlayerNotesContext.Provider value={{ getNote, loadNotes, setNote }}>
      {children}
    </PlayerNotesContext.Provider>
  );
}

export function usePlayerNotes(): PlayerNotesContextType {
  const context = useContext(PlayerNotesContext);

  if (!context) {
    throw new Error("usePlayerNotes must be used within a PlayerNotesProvider");
  }

  return context;
}