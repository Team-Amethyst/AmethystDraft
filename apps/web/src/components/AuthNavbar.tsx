import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router";
import {
  Zap,
  ChevronDown,
  Settings,
  LogOut,
  UserCog,
  Bell,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import { useValuationBoardAlerts } from "../contexts/ValuationBoardAlertsContext";
import { getNewsSignals, type NewsSignal } from "../api/engine";
import { createClientUuid } from "../utils/randomUuid";
import {
  newsSignalsCacheKey,
  readNewsSignalsCache,
  writeNewsSignalsCache,
} from "../api/newsSignalsCache";
import {
  useNewsSignalsRealtime,
  type NewsSocketConnectionState,
} from "../hooks/useNewsSignalsRealtime";
import { sortLeaguesNewestFirst } from "../domain/leagueSeasonGroups";
import {
  IntelligenceAlertsPanel,
} from "./intelligence-alerts/IntelligenceAlertsPanel";
import {
  signalTypeForApiFilter,
  type IntelligenceAlertFilter,
} from "./intelligence-alerts/intelligenceAlertsUi";
import "./AuthNavbar.css";

const NEWS_LOOKBACK_DAYS = 7;

const WEBHOOK_PINGS_STORAGE_KEY = "amethyst.webhookPings.v1";

type StoredWebhookPing = { id: string; message: string; at: number };

function loadWebhookPingsFromStorage(): StoredWebhookPing[] {
  try {
    const raw = sessionStorage.getItem(WEBHOOK_PINGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is StoredWebhookPing =>
          x != null &&
          typeof x === "object" &&
          typeof (x as StoredWebhookPing).id === "string" &&
          typeof (x as StoredWebhookPing).message === "string" &&
          typeof (x as StoredWebhookPing).at === "number",
      )
      .slice(0, 8);
  } catch {
    return [];
  }
}

function saveWebhookPingsToStorage(rows: StoredWebhookPing[]) {
  try {
    sessionStorage.setItem(
      WEBHOOK_PINGS_STORAGE_KEY,
      JSON.stringify(rows.slice(0, 8)),
    );
  } catch {
    /* private mode / quota */
  }
}
function signalFingerprint(s: NewsSignal): string {
  return `${s.player_name}|${s.effective_date}|${s.signal_type}|${s.description}|${s.source}`;
}

export default function AuthNavbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, token } = useAuth();
  const { league, allLeagues } = useLeague();
  const leaguesForSelector = useMemo(
    () => [...allLeagues].sort(sortLeaguesNewestFirst),
    [allLeagues],
  );
  const { boardValuationAlerts, clearBoardValuationAlerts } =
    useValuationBoardAlerts();
  const [leagueDropdownOpen, setLeagueDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertFilter, setAlertFilter] =
    useState<IntelligenceAlertFilter>("all");
  const [alertSignals, setAlertSignals] = useState<NewsSignal[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [realtimeNonce, setRealtimeNonce] = useState(0);
  const [webhookPings, setWebhookPings] = useState<StoredWebhookPing[]>(() =>
    loadWebhookPingsFromStorage(),
  );
  const [newsSocketState, setNewsSocketState] =
    useState<NewsSocketConnectionState>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const baselineEstablishedRef = useRef(false);
  const knownKeysRef = useRef<Set<string>>(new Set());
  /** Coalesce rapid Socket.IO pushes into one news fetch + toast cycle. */
  const pushDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Tracks last open+filter+token key so Socket.IO nonce bumps alone use push refresh (one fetch). */
  const alertsPanelKeyRef = useRef<string>("");

  const applySignals = useCallback(
    (signals: NewsSignal[], source: "dropdown" | "push") => {
      setAlertSignals(signals);

      if (source === "dropdown") {
        knownKeysRef.current = new Set(signals.map(signalFingerprint));
        baselineEstablishedRef.current = true;
        return;
      }

      if (!baselineEstablishedRef.current) {
        knownKeysRef.current = new Set(signals.map(signalFingerprint));
        baselineEstablishedRef.current = true;
        return;
      }

      const prev = knownKeysRef.current;
      let newInjury = false;
      let anyNew = false;
      for (const s of signals) {
        const k = signalFingerprint(s);
        if (!prev.has(k)) {
          anyNew = true;
          if (s.signal_type === "injury") {
            newInjury = true;
          }
        }
      }
      knownKeysRef.current = new Set(signals.map(signalFingerprint));

      if (newInjury) {
        toast.warning(
          "New injury alert — open Intelligence Alerts for details.",
          { duration: 10_000, id: "draftroom-news-injury" },
        );
      } else if (anyNew) {
        toast.message("Intelligence alerts updated.", {
          duration: 6000,
          id: "draftroom-news-updated",
        });
      }
    },
    [],
  );

  const bumpRealtimeFromPush = useCallback(() => {
    if (pushDebounceRef.current) clearTimeout(pushDebounceRef.current);
    pushDebounceRef.current = setTimeout(() => {
      pushDebounceRef.current = null;
      setRealtimeNonce((n) => n + 1);
    }, 320);
  }, []);

  useEffect(() => {
    return () => {
      if (pushDebounceRef.current) clearTimeout(pushDebounceRef.current);
    };
  }, []);

  const recordWebhookPing = useCallback((message?: string) => {
    const text =
      message?.trim() ||
      "Webhook test received — live connection OK.";
    setWebhookPings((prev) => {
      const row: StoredWebhookPing = {
        id: createClientUuid(),
        message: text,
        at: Date.now(),
      };
      const next = [row, ...prev].slice(0, 8);
      saveWebhookPingsToStorage(next);
      return next;
    });
  }, []);

  // Connect whenever signed in — league-scoped routes are not required for global MLB signals.
  useNewsSignalsRealtime(
    token,
    Boolean(token),
    bumpRealtimeFromPush,
    recordWebhookPing,
    setNewsSocketState,
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setLeagueDropdownOpen(false);
      }
    };
    if (leagueDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [leagueDropdownOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        userDropdownRef.current &&
        !userDropdownRef.current.contains(e.target as Node)
      ) {
        setUserDropdownOpen(false);
      }
    };
    if (userDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [userDropdownOpen]);

  useEffect(() => {
    if (!alertsOpen || !token) {
      if (!alertsOpen) alertsPanelKeyRef.current = "";
      return;
    }

    const signalType = signalTypeForApiFilter(alertFilter);
    const cacheKey = newsSignalsCacheKey(NEWS_LOOKBACK_DAYS, signalType);
    const panelKey = `${alertsOpen}|${alertFilter}|${token}`;
    const panelContextChanged = alertsPanelKeyRef.current !== panelKey;
    alertsPanelKeyRef.current = panelKey;

    /** Opening the panel or changing filter uses dropdown semantics; nonce-only bumps use push (toasts). */
    const isPushOnly =
      !panelContextChanged && realtimeNonce > 0;

    const cached = readNewsSignalsCache(cacheKey);
    const hadCache = cached !== null;

    let active = true;

    if (!isPushOnly) {
      if (cached) {
        applySignals(cached.signals, "dropdown");
        setAlertsError(null);
      }

      queueMicrotask(() => {
        if (!hadCache) {
          setAlertsLoading(true);
          setAlertsError(null);
        } else {
          setAlertsError(null);
        }
      });
    }

    getNewsSignals(token, {
      days: NEWS_LOOKBACK_DAYS,
      signal_type: signalType,
    })
      .then((response) => {
        if (!active) return;
        writeNewsSignalsCache(cacheKey, response);
        applySignals(response.signals, isPushOnly ? "push" : "dropdown");
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (!isPushOnly && !hadCache) {
          let message = "Unable to load MLB alerts right now.";
          if (error instanceof Error) {
            if (error.name === "AbortError") {
              message =
                "Request timed out. Check your connection and try again.";
            } else {
              message = error.message;
            }
          }
          setAlertsError(message);
          setAlertSignals([]);
        }
      })
      .finally(() => {
        if (!active) return;
        if (!isPushOnly) setAlertsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [alertsOpen, token, alertFilter, realtimeNonce, applySignals]);

  const leagueBase = league ? `/leagues/${league.id}` : "";
  const isActive = (path: string) => location.pathname === path;

  useEffect(() => {
    if (!league) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const routes: Record<string, string> = {
        "1": `${leagueBase}/research`,
        "2": `${leagueBase}/my-draft`,
        "3": `${leagueBase}/command-center`,
        "4": `${leagueBase}/overview`,
        "5": `${leagueBase}/taxi-draft`,
      };
      if (routes[e.key]) navigate(routes[e.key]);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [league, leagueBase, navigate]);

  const handleLogout = () => {
    clearBoardValuationAlerts();
    logout();
    navigate("/");
  };

  useEffect(() => {
    if (!token) clearBoardValuationAlerts();
  }, [token, clearBoardValuationAlerts]);

  return (
    <>
      <nav className="auth-navbar">
      <div className="auth-navbar-logo" onClick={() => navigate("/leagues")}>
        <Zap size={18} className="logo-icon" />
        <span className="logo-text">DRAFTROOM</span>
      </div>

      {league && (
        <div className="auth-navbar-center">
          <button
            className={
              "nav-link" +
              (isActive(`${leagueBase}/research`) ? " nav-link-active" : "")
            }
            onClick={() => navigate(`${leagueBase}/research`)}
          >
            <span className="nav-key-badge">1</span>Research
          </button>
          <button
            className={
              "nav-link" +
              (isActive(`${leagueBase}/my-draft`) ? " nav-link-active" : "")
            }
            onClick={() => navigate(`${leagueBase}/my-draft`)}
          >
            <span className="nav-key-badge">2</span>My Draft
          </button>
          <button
            className={
              "nav-link" +
              (isActive(`${leagueBase}/command-center`)
                ? " nav-link-active"
                : "")
            }
            onClick={() => navigate(`${leagueBase}/command-center`)}
          >
            <span className="nav-key-badge">3</span>Command Center
          </button>
          <button
            className={
              "nav-link" +
              (isActive(`${leagueBase}/overview`) ? " nav-link-active" : "")
            }
            onClick={() => navigate(`${leagueBase}/overview`)}
          >
            <span className="nav-key-badge">4</span>Overview
          </button>
          <button
            className={
              "nav-link" +
              (isActive(`${leagueBase}/taxi-draft`) ? " nav-link-active" : "")
            }
            onClick={() => navigate(`${leagueBase}/taxi-draft`)}
          >
            <span className="nav-key-badge">5</span>Taxi Draft
          </button>
        </div>
      )}

      <div className="auth-navbar-actions">
        {league && (
          <div className="league-selector" ref={dropdownRef}>
            <button
              className="league-selector-btn"
              onClick={() => setLeagueDropdownOpen((o) => !o)}
            >
              <span className="league-selector-btn-name">{league.name}</span>
              <ChevronDown
                size={14}
                className={
                  "league-selector-chevron" +
                  (leagueDropdownOpen ? " chevron-open" : "")
                }
              />
            </button>
            {leagueDropdownOpen && (
              <div className="league-selector-dropdown">
                {leaguesForSelector.map((l) => (
                  <div
                    key={l.id}
                    className={
                      "league-selector-row" +
                      (l.id === league.id ? " league-selector-row-current" : "")
                    }
                  >
                    <button
                      className="league-selector-item"
                      onClick={() => {
                        navigate(`/leagues/${l.id}/research`);
                        setLeagueDropdownOpen(false);
                      }}
                    >
                      <span className="league-selector-item-name">{l.name}</span>
                    </button>
                    <button
                      className="league-selector-settings"
                      title="League settings"
                      onClick={() => {
                        navigate(`/leagues/${l.id}/settings`);
                        setLeagueDropdownOpen(false);
                      }}
                    >
                      <Settings size={13} />
                    </button>
                  </div>
                ))}
                <div className="league-selector-divider" />
                <button
                  className="league-selector-item"
                  onClick={() => {
                    navigate("/leagues");
                    setLeagueDropdownOpen(false);
                  }}
                >
                  All Leagues
                </button>
              </div>
            )}
          </div>
        )}
        {token && (
          <div className="nb-alerts-wrap">
            <button
              type="button"
              className={
                "nb-alerts-btn" +
                (newsSocketState === false ? " nb-alerts-btn--socket-off" : "")
              }
              data-testid="nb-alerts-bell"
              aria-expanded={alertsOpen}
              aria-controls={alertsOpen ? "intelligence-alerts-panel" : undefined}
              aria-haspopup="dialog"
              onClick={() => setAlertsOpen((o) => !o)}
              title={
                newsSocketState === false
                  ? "Intelligence Alerts — live socket disconnected (custom webhook pings will not arrive)"
                  : "Intelligence Alerts"
              }
            >
              <Bell size={15} />
            </button>
          </div>
        )}
        <div className="user-avatar-wrap" ref={userDropdownRef}>
          <button
            className="user-avatar-btn"
            onClick={() => setUserDropdownOpen((o) => !o)}
            title={user?.displayName}
          >
            {user?.displayName?.[0]?.toUpperCase() ?? "?"}
          </button>
          {userDropdownOpen && (
            <div className="user-dropdown">
              <div className="user-dropdown-greeting">
                Hi, {user?.displayName ?? "there"}
              </div>
              <div className="user-dropdown-divider" />
              <button
                className="user-dropdown-item"
                onClick={() => {
                  navigate("/account");
                  setUserDropdownOpen(false);
                }}
              >
                <UserCog size={14} />
                <span>Manage Account</span>
              </button>
              <button
                className="user-dropdown-item user-dropdown-signout"
                onClick={() => {
                  handleLogout();
                  setUserDropdownOpen(false);
                }}
              >
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
    {token ? (
      <IntelligenceAlertsPanel
        open={alertsOpen}
        onRequestClose={() => setAlertsOpen(false)}
        alertFilter={alertFilter}
        onAlertFilterChange={setAlertFilter}
        signals={alertSignals}
        loading={alertsLoading}
        error={alertsError}
        webhookPings={webhookPings}
        boardValuationAlerts={boardValuationAlerts}
        newsSocketDisconnected={newsSocketState === false}
      />
    ) : null}
    </>
  );
}
