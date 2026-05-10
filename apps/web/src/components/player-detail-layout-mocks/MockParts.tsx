import type { Player } from "../../types/player";
import { displayAuctionTier } from "../../domain/playerRankTier";
import PosBadge from "../PosBadge";

function dash(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

export function MockIdentityBlock({
  player,
  headshotSize,
}: {
  player: Player;
  headshotSize: "lg" | "md";
}) {
  const positions = player.positions?.length ? player.positions : [player.position];
  return (
    <div className={`pdlm-identity pdlm-identity--shot-${headshotSize}`}>
      <img className="pdlm-identity__img" src={player.headshot} alt={player.name} />
      <div className="pdlm-identity__text">
        <h2 className="pdlm-identity__name">{player.name}</h2>
        <div className="pdlm-identity__meta">
          <span>{player.team}</span>
          <span className="pdlm-identity__sep">·</span>
          <span>Model rank {dash(player.catalog_rank)}</span>
          <span className="pdlm-identity__sep">·</span>
          <span>Tier {dash(displayAuctionTier(player))}</span>
        </div>
        <div className="pdlm-identity__pos">
          {positions.map((p) => (
            <PosBadge key={p} pos={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function MockValuationMetrics({
  variant,
}: {
  variant: "hero" | "compact" | "rail";
}) {
  const wrapClass =
    variant === "rail"
      ? "pdlm-metrics pdlm-metrics--rail"
      : variant === "compact"
        ? "pdlm-metrics pdlm-metrics--compact"
        : "pdlm-metrics pdlm-metrics--hero";
  return (
    <div className={wrapClass} role="list">
      <div className="pdlm-metrics__cell pdlm-metrics__cell--strong" role="listitem">
        <span className="pdlm-metrics__label">Auction Value</span>
        <span className="pdlm-metrics__value">$45</span>
      </div>
      <div className="pdlm-metrics__cell pdlm-metrics__cell--strong" role="listitem">
        <span className="pdlm-metrics__label">Max Bid</span>
        <span className="pdlm-metrics__value">$52</span>
      </div>
      <div className="pdlm-metrics__cell" role="listitem">
        <span className="pdlm-metrics__label">Team Value</span>
        <span className="pdlm-metrics__value">$42</span>
      </div>
      <div className="pdlm-metrics__cell" role="listitem">
        <span className="pdlm-metrics__label">Roster Edge</span>
        <span className="pdlm-metrics__value">−$3</span>
      </div>
    </div>
  );
}

export function MockDraftNotes({
  note,
  onNoteChange,
}: {
  note: string;
  onNoteChange: (v: string) => void;
}) {
  return (
    <div className="pdlm-notes">
      <div className="pdlm-notes__head">
        <span className="pdlm-notes__title">Draft Notes</span>
        <span className="pdlm-notes__hint">Notes save automatically as you type.</span>
      </div>
      <textarea
        className="pdlm-notes__area"
        value={note}
        placeholder="Capture target bid, fallback options, roster fit, and risk notes…"
        onChange={(e) => onNoteChange(e.target.value)}
        rows={5}
      />
    </div>
  );
}

export function MockProfileDl({ player }: { player: Player }) {
  return (
    <dl className="pdlm-profile-dl">
      <dt>Age</dt>
      <dd>{dash(player.age)}</dd>
      <dt>MLB ID</dt>
      <dd>{dash(player.mlbId)}</dd>
      <dt>Indicator</dt>
      <dd>{dash(player.indicator)}</dd>
      <dt>Drafted</dt>
      <dd>Available</dd>
    </dl>
  );
}

export function MockPerformanceSnapshot({ player }: { player: Player }) {
  const bat = player.stats.batting;
  const pit = player.stats.pitching;
  const pb = player.projection.batting;
  const pp = player.projection.pitching;
  const b3 = player.stats3yr?.batting;
  const p3 = player.stats3yr?.pitching;
  return (
    <div className={bat && pit ? "pdlm-snap pdlm-snap--split" : "pdlm-snap"}>
      {bat ? (
        <div className="pdlm-snap__block">
          <h4 className="pdlm-snap__h">Batting</h4>
          <div className="pdlm-table">
            <div className="pdlm-table__row pdlm-table__row--head">
              <span>Stat</span>
              <span>Last</span>
              <span>Proj</span>
              <span>3Y</span>
            </div>
            <div className="pdlm-table__row">
              <span>HR</span>
              <span>{dash(bat.hr)}</span>
              <span>{dash(pb?.hr)}</span>
              <span>{dash(b3?.hr)}</span>
            </div>
            <div className="pdlm-table__row">
              <span>RBI</span>
              <span>{dash(bat.rbi)}</span>
              <span>{dash(pb?.rbi)}</span>
              <span>{dash(b3?.rbi)}</span>
            </div>
            <div className="pdlm-table__row">
              <span>SB</span>
              <span>{dash(bat.sb)}</span>
              <span>{dash(pb?.sb)}</span>
              <span>{dash(b3?.sb)}</span>
            </div>
          </div>
        </div>
      ) : null}
      {pit ? (
        <div className="pdlm-snap__block">
          <h4 className="pdlm-snap__h">Pitching</h4>
          <div className="pdlm-table">
            <div className="pdlm-table__row pdlm-table__row--head">
              <span>Stat</span>
              <span>Last</span>
              <span>Proj</span>
              <span>3Y</span>
            </div>
            <div className="pdlm-table__row">
              <span>ERA</span>
              <span>{dash(pit.era)}</span>
              <span>{dash(pp?.era)}</span>
              <span>{dash(p3?.era)}</span>
            </div>
            <div className="pdlm-table__row">
              <span>WHIP</span>
              <span>{dash(pit.whip)}</span>
              <span>{dash(pp?.whip)}</span>
              <span>{dash(p3?.whip)}</span>
            </div>
            <div className="pdlm-table__row">
              <span>K</span>
              <span>{dash(pit.strikeouts)}</span>
              <span>{dash(pp?.strikeouts)}</span>
              <span>{dash(p3?.strikeouts)}</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MockDisclosuresFooter() {
  return (
    <div className="pdlm-disclosures">
      <details className="pdlm-disclosures__item">
        <summary>Why this value?</summary>
        <p className="pdlm-disclosures__body">
          Baseline Strength, replacement key, surplus basis, and roster-adjusted values appear here in
          production.
        </p>
      </details>
      <details className="pdlm-disclosures__item">
        <summary>Model notes</summary>
        <p className="pdlm-disclosures__body">Outlook, market notes, and explain_v2 drivers appear here.</p>
      </details>
    </div>
  );
}
