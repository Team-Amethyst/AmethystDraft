import { useEffect } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, AlertTriangle } from "lucide-react";
import type { NewsSignal } from "../../api/engine";
import type { ValuationUiAlert } from "../../domain/valuationAlerts";
import {
  INTELLIGENCE_ALERT_FILTER_TABS,
  formatNewsEffectiveRelative,
  formatNewsSignalTypeBadge,
  formatSeverityBadge,
  newsSignalVisualKind,
  type IntelligenceAlertFilter,
} from "./intelligenceAlertsUi";
import "./IntelligenceAlertsPanel.css";

export type IntelligenceAlertsWebhookPing = {
  id: string;
  message: string;
  at: number;
};

export type IntelligenceAlertsPanelProps = {
  open: boolean;
  onRequestClose: () => void;
  alertFilter: IntelligenceAlertFilter;
  onAlertFilterChange: (filter: IntelligenceAlertFilter) => void;
  signals: readonly NewsSignal[];
  loading: boolean;
  error: string | null;
  webhookPings: readonly IntelligenceAlertsWebhookPing[];
  boardValuationAlerts: readonly ValuationUiAlert[];
  newsSocketDisconnected: boolean;
};

function signalRowKey(signal: NewsSignal): string {
  return `${signal.player_name}|${signal.effective_date}|${signal.signal_type}|${signal.description}|${signal.source}`;
}

export function IntelligenceAlertsPanel({
  open,
  onRequestClose,
  alertFilter,
  onAlertFilterChange,
  signals,
  loading,
  error,
  webhookPings,
  boardValuationAlerts,
  newsSocketDisconnected,
}: IntelligenceAlertsPanelProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onRequestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onRequestClose]);

  if (!open || typeof document === "undefined") return null;

  const panel = (
    <>
      <div
        className="nb-alerts-backdrop"
        data-testid="nb-alerts-backdrop"
        aria-hidden
        onMouseDown={(e) => {
          e.preventDefault();
          onRequestClose();
        }}
      />
      <aside
        className="nb-alerts-panel"
        id="intelligence-alerts-panel"
        data-testid="nb-alerts-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nb-alerts-panel-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="nb-alerts-panel-header">
          <h2 id="nb-alerts-panel-title" className="nb-alerts-title">
            Intelligence Alerts
          </h2>
          <button
            type="button"
            className="nb-alerts-panel-close"
            aria-label="Close intelligence alerts"
            onClick={onRequestClose}
          >
            ×
          </button>
        </header>

        {newsSocketDisconnected ? (
          <div className="nb-alerts-socket-warning" role="status">
            <strong>No live socket to the API.</strong> A 204 webhook still
            broadcasts only to connected browsers. Keep this tab open while
            testing; add{" "}
            <code className="nb-alerts-code">{window.location.origin}</code> to API{" "}
            <code className="nb-alerts-code">CORS_ORIGIN</code> if the connection
            fails. Your hook response header{" "}
            <code className="nb-alerts-code">
              X-Draftroom-Socket-Connections
            </code>{" "}
            must be ≥ 1 for a toast or row here.
          </div>
        ) : null}

        <div
          className="nb-alerts-filter-tabs"
          role="tablist"
          aria-label="Filter alerts by type"
        >
          {INTELLIGENCE_ALERT_FILTER_TABS.map((tab) => {
            const selected = alertFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                data-testid={`nb-alert-filter-${tab.id}`}
                className={"nb-alerts-tab" + (selected ? " is-active" : "")}
                onClick={() => onAlertFilterChange(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="nb-alerts-scroll">
          {webhookPings.map((w) => (
            <div key={w.id} className="nb-alert-item alert-webhook">
              <div className="nb-alert-icon nb-alert-icon--dot" aria-hidden>
                ●
              </div>
              <div className="nb-alert-body">
                <div className="nb-alert-head">
                  <span className="nb-alert-title">Live webhook message</span>
                  <time
                    className="nb-alert-time"
                    dateTime={new Date(w.at).toISOString()}
                  >
                    {formatNewsEffectiveRelative(new Date(w.at).toISOString())}
                  </time>
                </div>
                <div className="nb-alert-meta">
                  <span className="nb-alert-pill nb-alert-pill-source">
                    Custom
                  </span>
                  <span className="nb-alert-pill nb-alert-pill-type">
                    Webhook
                  </span>
                  <span className="nb-alert-source">Engine hook</span>
                </div>
                <div className="nb-alert-desc nb-alert-desc--clamp">{w.message}</div>
              </div>
            </div>
          ))}

          {boardValuationAlerts.length > 0 ? (
            <>
              <div className="nb-board-valuation-heading">Board valuation</div>
              {boardValuationAlerts.slice(0, 2).map((a) => (
                <div
                  key={a.id}
                  className={
                    "nb-alert-item nb-alert-board-valuation nb-alert-board-valuation--" +
                    a.severity
                  }
                >
                  <div className="nb-alert-icon nb-alert-icon--symbol" aria-hidden>
                    ∑
                  </div>
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
          ) : null}

          {loading ? (
            <div className="nb-alerts-state nb-alerts-loading">
              <RefreshCw size={13} className="nb-alerts-spinner" />
              Loading MLB alerts...
            </div>
          ) : null}

          {!loading && error ? (
            <div className="nb-alerts-state nb-alerts-error">
              <AlertTriangle size={13} />
              <span>{error}</span>
            </div>
          ) : null}

          {!loading &&
          !error &&
          signals.length === 0 &&
          webhookPings.length === 0 &&
          boardValuationAlerts.length === 0 ? (
            <div className="nb-alerts-empty" data-testid="nb-alerts-empty">
              No alerts for this filter.
            </div>
          ) : null}

          {!loading &&
          !error &&
          signals.length === 0 &&
          (webhookPings.length > 0 || boardValuationAlerts.length > 0) ? (
            <div
              className="nb-alerts-empty nb-alerts-empty--inline"
              data-testid="nb-alerts-empty-inline"
            >
              No alerts for this filter.
            </div>
          ) : null}

          {!loading &&
            !error &&
            signals.map((signal) => {
              const vk = newsSignalVisualKind(signal.signal_type);
              return (
                <article
                  key={signalRowKey(signal)}
                  className={`nb-alert-item nb-alert-signal alert-${vk}`}
                >
                  <div className="nb-alert-body">
                    <div className="nb-alert-head">
                      <span className="nb-alert-title">{signal.player_name}</span>
                      <time
                        className="nb-alert-time"
                        dateTime={signal.effective_date}
                      >
                        {formatNewsEffectiveRelative(signal.effective_date)}
                      </time>
                    </div>
                    <div className="nb-alert-meta">
                      <span
                        className={`nb-alert-pill nb-alert-pill-${signal.severity}`}
                      >
                        {formatSeverityBadge(signal.severity)}
                      </span>
                      <span className="nb-alert-pill nb-alert-pill-type">
                        {formatNewsSignalTypeBadge(signal.signal_type)}
                      </span>
                      <span className="nb-alert-source">{signal.source}</span>
                    </div>
                    <div className="nb-alert-desc nb-alert-desc--clamp">
                      {signal.description}
                    </div>
                  </div>
                </article>
              );
            })}
        </div>
      </aside>
    </>
  );

  return createPortal(panel, document.body);
}
