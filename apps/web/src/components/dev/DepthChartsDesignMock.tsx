import { useMemo, useState } from "react";
import type { Player } from "../../types/player";
import { DepthChartView } from "../research/DepthChartView";
import PlayerDetailModal from "../PlayerDetailModal";
import {
  buildDepthChartStubPlayer,
  depthChartModalContextFromRow,
} from "../../domain/depthChartPlayerProfile";
import { depthChartsDesignFixture } from "./depthChartsDesignFixture";
import "../../pages/Research.css";

const catalogFixture: Player[] = [
  {
    id: "schlittler-cat",
    mlbId: 694973,
    name: "Cam Schlittler",
    team: "NYY",
    position: "SP",
    age: 24,
    catalog_rank: 12,
    value: 18,
    catalog_tier: 2,
    auction_value: 5,
    headshot: "",
    stats: {},
    projection: {},
    outlook: "",
  },
  {
    id: "warren-cat",
    mlbId: 701542,
    name: "Will Warren",
    team: "NYY",
    position: "SP",
    age: 24,
    catalog_rank: 40,
    value: 8,
    catalog_tier: 3,
    auction_value: 1,
    headshot: "",
    stats: {},
    projection: {},
    outlook: "",
  },
  {
    id: "weathers-cat",
    mlbId: 671922,
    name: "Ryan Weathers",
    team: "NYY",
    position: "SP",
    age: 25,
    catalog_rank: 45,
    value: 7,
    catalog_tier: 3,
    auction_value: 1,
    headshot: "",
    stats: {},
    projection: {},
    outlook: "",
  },
  {
    id: "judge-cat",
    mlbId: 592450,
    name: "Aaron Judge",
    team: "NYY",
    position: "RF",
    age: 33,
    catalog_rank: 1,
    value: 60,
    catalog_tier: 1,
    auction_value: 35,
    headshot: "",
    stats: {},
    projection: {},
    outlook: "",
  },
  {
    id: "jones-cat",
    mlbId: 682987,
    name: "Spencer Jones",
    team: "NYY",
    position: "RF",
    age: 24,
    catalog_rank: 80,
    value: 1,
    catalog_tier: 4,
    valuation_eligible: false,
    headshot: "",
    stats: {},
    projection: {},
    outlook: "",
  },
  {
    id: "bellinger-cat",
    mlbId: 641355,
    name: "Cody Bellinger",
    team: "NYY",
    position: "LF",
    age: 30,
    catalog_rank: 20,
    value: 30,
    catalog_tier: 2,
    auction_value: 15,
    headshot: "",
    stats: {},
    projection: {},
    outlook: "",
  },
];

export default function DepthChartsDesignMock() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showNoValuationModal, setShowNoValuationModal] = useState(false);

  const stubWarren = useMemo(
    () =>
      buildDepthChartStubPlayer(
        depthChartsDesignFixture.positions.SP[1]!,
        "NYY",
      ),
    [],
  );

  return (
    <DesignMockShell>
      <DepthChartView
        depthChartData={depthChartsDesignFixture}
        selectedTeamId={147}
        teamAbbr="NYY"
        catalogPlayers={catalogFixture}
        rosterEntries={[
          {
            _id: "r1",
            userId: "u",
            leagueId: "l",
            teamId: "t",
            externalPlayerId: "592450",
            playerName: "Aaron Judge",
            playerTeam: "NYY",
            positions: ["RF"],
            price: 35,
            rosterSlot: "OF",
            isKeeper: false,
            acquiredAt: "",
            createdAt: "",
          },
        ]}
        watchlist={[]}
        valuationsByPlayerId={
          new Map([
            ["schlittler-cat", { auction_value: 5 } as never],
            ["warren-cat", { auction_value: 1 } as never],
            ["weathers-cat", { auction_value: 1 } as never],
            ["judge-cat", { auction_value: 35 } as never],
            ["bellinger-cat", { auction_value: 15 } as never],
          ])
        }
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onTeamChange={() => {}}
        onRefresh={() => {}}
        isInWatchlist={() => false}
        onPlayerClick={(row) => {
          if (row.playerName === "Will Warren") {
            setShowNoValuationModal(true);
          }
        }}
        onStarToggle={() => {}}
      />
      <div style={{ marginTop: "1rem" }}>
        <button
          type="button"
          className="depth-chart-refresh-btn"
          onClick={() => setShowNoValuationModal(true)}
        >
          Show no-valuation modal (screenshot)
        </button>
      </div>
      <PlayerDetailModal
        isOpen={showNoValuationModal}
        player={stubWarren}
        depthChartOnlyMode="depth_only"
        depthChartContext={depthChartModalContextFromRow(
          depthChartsDesignFixture.positions.SP[1]!,
          "SP",
        )}
        onClose={() => setShowNoValuationModal(false)}
        onMoveToCommandCenter={() => {}}
        researchSurface
      />
    </DesignMockShell>
  );
}

function DesignMockShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="research-page" style={{ minHeight: "100vh", padding: "1rem" }}>
      <div className="research-content">{children}</div>
    </div>
  );
}
