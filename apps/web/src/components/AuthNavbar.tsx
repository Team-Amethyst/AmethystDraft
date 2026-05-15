import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router";
import {
  Zap,
  ChevronDown,
  Settings,
  LogOut,
  UserCog,
  Bell,
  AlertTriangle,
  RefreshCw,
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
import { leagueSeasonLabel } from "../domain/leagueSeasonGroups";
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
type NewsSignalType =
  | "injury"
  | "role_change"
  | "trade"
  | "demotion"
  | "promotion";

/** Dropdown filter; maps to `GET /signals/news` optional `signal_type`. */
type AlertFilter = "all" | NewsSignalType;

const ALERT_FILTER_OPTIONS: { value: AlertFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "injury", label: "Injuries" },
  { value: "role_change", label: "Role & playing time" },
  { value: "trade", label: "Trades" },
  { value: "promotion", label: "Promotions" },
  { value: "demotion", label: "Demotions" },
];

function signalTypeForFilter(filter: AlertFilter): NewsSignalType | undefined {
  return filter === "all" ? undefined : filter;
}

function getAlertClass(signalType: string): "injury" | "trade" | "structural" {
  if (signalType === "injury") return "injury";
  if (signalType === "trade") return "trade";
  return "structural";
}

function formatAlertTime(effectiveDate: string): string {
  const parsed = new Date(effectiveDate);
  if (Number.isNaN(parsed.getTime())) return "Just now";
  const diffMinutes = Math.floor((Date.now() - parsed.getTime()) / 60000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatAlertType(signalType: string): string {
  return signalType
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function signalFingerprint(s: NewsSignal): string {
  return `${s.player_name}|${s.effective_date}|${s.signal_type}|${s.description}|${s.source}`;
}

export default function AuthNavbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, token } = useAuth();
  const { league, allLeagues } = useLeague();
  const { boardValuationAlerts, clearBoardValuationAlerts } =
    useValuationBoardAlerts();
  const [leagueDropdownOpen, setLeagueDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertFilter, setAlertFilter] = useState<AlertFilter>("all");
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
  const alertsRef = useRef<HTMLDivElement>(null);
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
    const handleClickOutside = (e: MouseEvent) => {
      if (alertsRef.current && !alertsRef.current.contains(e.target as Node)) {
        setAlertsOpen(false);
      }
    };
    if (alertsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [alertsOpen]);

  useEffect(() => {
    if (!alertsOpen || !token) {
      if (!alertsOpen) alertsPanelKeyRef.current = "";
      return;
    }

    const signalType = signalTypeForFilter(alertFilter);
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
  const visibleAlerts = alertSignals;

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
              <span className="league-selector-btn-text">
                <span className="league-selector-btn-name">{league.name}</span>
                <span className="league-selector-btn-season">
                  {leagueSeasonLabel(league, allLeagues)}
                </span>
              </span>
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
                {allLeagues.map((l) => (
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
                      <span className="league-selector-item-season">
                        {leagueSeasonLabel(l, allLeagues)}
                      </span>
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
          <div className="nb-alerts-wrap" ref={alertsRef}>
            <button
              type="button"
              className={
                "nb-alerts-btn" +
                (newsSocketState === false ? " nb-alerts-btn--socket-off" : "")
              }
              onClick={() => setAlertsOpen((o) => !o)}
              title={
                newsSocketState === false
                  ? "Intelligence Alerts — live socket disconnected (custom webhook pings will not arrive)"
                  : "Intelligence Alerts"
              }
            >
              <Bell size={15} />
            </button>
            {alertsOpen && (
              <div className="nb-alerts-dropdown">
                <div className="nb-alerts-header">
                  <span className="nb-alerts-title">Intelligence Alerts</span>
                </div>
                {newsSocketState === false && (
                  <div className="nb-alerts-socket-warning" role="status">
                    <strong>No live socket to the API.</strong> A 204 webhook still
                    broadcasts only to connected browsers. Keep this tab open while
                    testing; add{" "}
                    <code className="nb-alerts-code">{window.location.origin}</code>{" "}
                    to API <code className="nb-alerts-code">CORS_ORIGIN</code> if the
                    connection fails. Your hook response header{" "}
                    <code className="nb-alerts-code">
                      X-Draftroom-Socket-Connections
                    </code>{" "}
                    must be ≥ 1 for a toast or row here.
                  </div>
                )}
                <div className="nb-alerts-filter-row">
                  <label className="nb-alerts-filter-label" htmlFor="nb-alerts-filter">
                    Show
                  </label>
                  <select
                    id="nb-alerts-filter"
                    className="nb-alerts-filter-select"
                    value={alertFilter}
                    onChange={(e) =>
                      setAlertFilter(e.target.value as AlertFilter)
                    }
                  >
                    {ALERT_FILTER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="nb-alerts-list">
                  {webhookPings.map((w) => (
                    <div key={w.id} className="nb-alert-item alert-webhook">
                      <div className="nb-alert-icon">●</div>
                      <div className="nb-alert-body">
                        <div className="nb-alert-head">
                          <span className="nb-alert-title">
                            Live webhook message
                          </span>
                          <span className="nb-alert-time">
                            {formatAlertTime(new Date(w.at).toISOString())}
                          </span>
                        </div>
                        <div className="nb-alert-meta">
                          <span className="nb-alert-pill nb-alert-pill-source">
                            Custom
                          </span>
                          <span className="nb-alert-source">Engine hook</span>
                        </div>
                        <div className="nb-alert-desc">{w.message}</div>
                      </div>
                    </div>
                  ))}
                  {boardValuationAlerts.length > 0 && (
                    <>
                      <div className="nb-board-valuation-heading">
                        Board valuation
                      </div>
                      {boardValuationAlerts.slice(0, 2).map((a) => (
                        <div
                          key={a.id}
                          className={
                            "nb-alert-item nb-alert-board-valuation nb-alert-board-valuation--" +
                            a.severity
                          }
                        >
                          <div className="nb-alert-icon">∑</div>
                          <div className="nb-alert-body">
                            <div className="nb-alert-head nb-alert-head--tight">
                              <span className="nb-alert-title">{a.title}</span>
                            </div>
                            <div className="nb-alert-desc nb-alert-desc--oneline">
                              {a.message}
                            </div>
                          </div>
                        </div>
                      ))}
                      {boardValuationAlerts.length > 2 ? (
                        <div className="nb-board-valuation-more">
                          +{boardValuationAlerts.length - 2} more
                        </div>
                      ) : null}
                    </>
                  )}
                  {alertsLoading && (
                    <div className="nb-alerts-state nb-alerts-loading">
                      <RefreshCw size={13} className="nb-alerts-spinner" />
                      Loading MLB alerts...
                    </div>
                  )}
                  {!alertsLoading && alertsError && (
                    <div className="nb-alerts-state nb-alerts-error">
                      <AlertTriangle size={13} />
                      <span>{alertsError}</span>
                    </div>
                  )}
                  {!alertsLoading &&
                    !alertsError &&
                    visibleAlerts.length === 0 &&
                    webhookPings.length === 0 &&
                    boardValuationAlerts.length === 0 && (
                    <div className="nb-alerts-empty">
                      No MLB alerts match this filter right now.
                    </div>
                  )}
                  {!alertsLoading &&
                    !alertsError &&
                    visibleAlerts.map((signal) => {
                      const alertClass = getAlertClass(signal.signal_type);
                      return (
                        <div
                          key={`${signal.player_name}-${signal.effective_date}-${signal.signal_type}`}
                          className={`nb-alert-item alert-${alertClass}`}
                        >
                          <div className="nb-alert-icon">
                            {signal.severity[0].toUpperCase()}
                          </div>
                          <div className="nb-alert-body">
                            <div className="nb-alert-head">
                              <span className="nb-alert-title">
                                {signal.player_name}
                              </span>
                              <span className="nb-alert-time">
                                {formatAlertTime(signal.effective_date)}
                              </span>
                            </div>
                            <div className="nb-alert-meta">
                              <span className={`nb-alert-pill nb-alert-pill-${signal.severity}`}>
                                {signal.severity}
                              </span>
                              <span className="nb-alert-pill nb-alert-pill-source">
                                {formatAlertType(signal.signal_type)}
                              </span>
                              <span className="nb-alert-source">{signal.source}</span>
                            </div>
                            <div className="nb-alert-desc">{signal.description}</div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
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
  );
}
