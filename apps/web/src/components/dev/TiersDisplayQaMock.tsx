import type { Player } from "../../types/player";
import TiersView from "../../pages/TiersView";

function p(partial: Partial<Player> & { id: string }): Player {
  return {
    mlbId: 100 + partial.id.length,
    name: partial.id,
    team: "SEA",
    position: "OF",
    age: 28,
    catalog_rank: 50,
    catalog_tier: 3,
    value: 1,
    headshot: "",
    stats: {},
    ...partial,
  } as Player;
}

/** Static pool for dev screenshots — display bands + Engine tier mismatches. */
const QA_PLAYERS: Player[] = [
  p({ id: "t1a", name: "Elite Ace", position: "P", auction_tier: 1, auction_value: 27, auction_rank: 1, market_adp: 12 }),
  p({ id: "t1b", name: "Star Bat", auction_tier: 1, auction_value: 25.5, auction_rank: 2, market_adp: 8 }),
  ...Array.from({ length: 2 }, (_, i) =>
    p({
      id: `t1-sold-${i}`,
      name: `Sold elite ${i}`,
      auction_tier: 1,
      auction_value: 26 - i * 0.5,
    }),
  ),
  p({ id: "t2a", name: "Strong OF", auction_tier: 1, auction_value: 18, auction_rank: 5, market_adp: 24 }),
  p({ id: "t2b", name: "Mid Starter", position: "SP", auction_tier: 2, auction_value: 15, auction_rank: 12 }),
  p({ id: "t2d", name: "Sold Mid", auction_tier: 2, auction_value: 16, auction_rank: 14 }),
  ...Array.from({ length: 2 }, (_, i) =>
    p({
      id: `t1-depleted-${i}`,
      name: `Depleted star ${i}`,
      auction_tier: 1,
      auction_value: 26,
    }),
  ),
  p({ id: "t3a", name: "Useful 1B", position: "1B", auction_tier: 2, auction_value: 11, auction_rank: 28 }),
  p({ id: "t4a", name: "Depth RP", position: "RP", auction_tier: 3, auction_value: 7, auction_rank: 55 }),
  p({ id: "t4b", name: "Cheap Util", auction_tier: 4, auction_value: 5, auction_rank: 72 }),
  p({ id: "mis", name: "Engine T1 / $4", auction_tier: 1, auction_value: 4, auction_rank: 90 }),
  ...Array.from({ length: 6 }, (_, i) =>
    p({
      id: `t5-${i}`,
      name: `Min bid ${i + 1}`,
      auction_tier: 5,
      auction_value: i % 2 === 0 ? 1 : 3,
      auction_rank: 100 + i,
    }),
  ),
  p({
    id: "outside",
    name: "Catalog Only",
    valuation_eligible: false,
    catalog_tier: 3,
    auction_value: undefined as unknown as number,
  }),
];

export default function TiersDisplayQaMock() {
  return (
    <div
      className="tiers-qa-mock"
      style={{
        padding: "1rem",
        minHeight: "100vh",
        background: "var(--app-bg)",
      }}
    >
      <TiersView
        players={QA_PLAYERS}
        draftedIds={
          new Set([
            "t2d",
            "t1-depleted-0",
            "t1-depleted-1",
            "t1a",
            "t1b",
            "t1-sold-0",
            "t1-sold-1",
          ])
        }
        draftedByTeam={new Map([["t2d", "Hornets"]])}
        draftedPriceByPlayerId={new Map([["t2d", 16]])}
        onPlayerClick={() => {}}
        isInWatchlist={() => false}
        addToWatchlist={() => {}}
        removeFromWatchlist={() => {}}
        scoringCategories={[
          { name: "HR", type: "counting" },
          { name: "ERA", type: "ratio" },
        ]}
      />
    </div>
  );
}
