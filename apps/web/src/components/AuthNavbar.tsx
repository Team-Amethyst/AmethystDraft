import { useEffect, useRef, useState } from "react";
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
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import { getNewsSignals, type NewsSignal } from "../api/engine";
import "./AuthNavbar.css";

const NEWS_LOOKBACK_DAYS = 7;
type NewsSignalType =
  | "injury"
  | "role_change"
  | "trade"
  | "demotion"
  | "promotion";

type AlertTab = {
  label: string;
  signalType?: NewsSignalType;
};

const ALERT_TABS: AlertTab[] = [
  { label: "All Alerts" },
  { label: "Injuries", signalType: "injury" },
  { label: "Role Changes", signalType: "role_change" },
  { label: "Trades", signalType: "trade" },
  { label: "Promotions", signalType: "promotion" },
  { label: "Demotions", signalType: "demotion" },
];

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

export default function AuthNavbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, token } = useAuth();
  const { league, allLeagues } = useLeague();
  const [leagueDropdownOpen, setLeagueDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertTab, setAlertTab] = useState<AlertTab["label"]>("All Alerts");
  const [alertSignals, setAlertSignals] = useState<NewsSignal[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const alertsRef = useRef<HTMLDivElement>(null);

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
    if (!alertsOpen || !token) return;
    const selectedTab = ALERT_TABS.find((tab) => tab.label === alertTab);
    let active = true;
    setAlertsLoading(true);
    setAlertsError(null);

    getNewsSignals(token, {
      days: NEWS_LOOKBACK_DAYS,
      signal_type: selectedTab?.signalType,
    })
      .then((response) => {
        if (!active) return;
        setAlertSignals(response.signals);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load MLB alerts right now.";
        setAlertsError(message);
        setAlertSignals([]);
      })
      .finally(() => {
        if (!active) return;
        setAlertsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [alertsOpen, token, alertTab]);

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
      };
      if (routes[e.key]) navigate(routes[e.key]);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [league, leagueBase, navigate]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

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
        </div>
      )}

      <div className="auth-navbar-actions">
        {league && (
          <div className="league-selector" ref={dropdownRef}>
            <button
              className="league-selector-btn"
              onClick={() => setLeagueDropdownOpen((o) => !o)}
            >
              <span>{league.name}</span>
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
                      {l.name}
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
        {league && (
          <div className="nb-alerts-wrap" ref={alertsRef}>
            <button
              className="nb-alerts-btn"
              onClick={() => setAlertsOpen((o) => !o)}
              title="Intelligence Alerts"
            >
              <Bell size={15} />
            </button>
            {alertsOpen && (
              <div className="nb-alerts-dropdown">
                <div className="nb-alerts-header">
                  <span className="nb-alerts-title">Intelligence Alerts</span>
                </div>
                <div className="nb-alerts-tabs">
                  {ALERT_TABS.map((tab) => (
                    <button
                      key={tab.label}
                      className={
                        "nb-alert-tab" + (alertTab === tab.label ? " active" : "")
                      }
                      onClick={() => setAlertTab(tab.label)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="nb-alerts-list">
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
                  {!alertsLoading && !alertsError && visibleAlerts.length === 0 && (
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
