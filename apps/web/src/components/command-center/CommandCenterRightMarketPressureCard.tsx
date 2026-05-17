import { useId, useRef, useState } from "react";
import type {
  MarketPressureStatusRow,
  MarketPressureViewModel,
} from "../../pages/commandCenterMarket";
import { MarketPressureModelDetailsPopover } from "./MarketPressureModelDetailsPopover";

function SummaryRow({ row }: { row: MarketPressureStatusRow }) {
  return (
    <div className="mp-summary-row" title={row.title}>
      <span className="mp-summary-row__label">{row.label}</span>
      <div className="mp-summary-row__value-col">
        <span
          className={`mp-summary-row__value mp-summary-row__value--${row.valueTone}`}
        >
          {row.value}
        </span>
      </div>
    </div>
  );
}

export function CommandCenterRightMarketPressureCard({
  marketPressure,
}: {
  marketPressure: MarketPressureViewModel | null;
}) {
  const popoverId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  if (!marketPressure) {
    return (
      <section className="cc-surface-card cc-surface-card--right cc-market-pressure-card">
        <div className="mp-card-header">
          <div className="rp-section-label">MARKET PRESSURE</div>
        </div>
        <p className="engine-market-empty">Engine market snapshot unavailable.</p>
      </section>
    );
  }

  const { compact, detailGroups, modelDetailsContextLine, fromEngine } =
    marketPressure;
  const { phaseTag, statusRows, fallbackNote } = compact;

  return (
    <section className="cc-surface-card cc-surface-card--right cc-market-pressure-card">
      <div className="mp-card-header">
        <div className="rp-section-label">MARKET PRESSURE</div>
        <span className="mp-phase-tag">{phaseTag}</span>
      </div>

      {!fromEngine && fallbackNote ? (
        <p className="mp-fallback-note">{fallbackNote}</p>
      ) : null}

      <div className="mp-summary-rows" aria-label="Market pressure status">
        {statusRows.map((row) => (
          <SummaryRow key={row.id} row={row} />
        ))}
      </div>

      <button
        ref={triggerRef}
        type="button"
        className="mp-model-details-trigger"
        aria-expanded={popoverOpen}
        aria-controls={popoverId}
        aria-haspopup="dialog"
        onClick={() => setPopoverOpen((open) => !open)}
      >
        <span className="mp-model-details-trigger__text">Model details</span>
        <span className="mp-model-details-trigger__arrow" aria-hidden>
          →
        </span>
      </button>

      {popoverOpen ? (
        <MarketPressureModelDetailsPopover
          id={popoverId}
          anchorRef={triggerRef}
          onClose={() => setPopoverOpen(false)}
          contextLine={modelDetailsContextLine}
          detailGroups={detailGroups}
        />
      ) : null}
    </section>
  );
}
