import { Link } from "react-router";
import PlayerDetailModalDesignMock from "../../components/dev/PlayerDetailModalDesignMock";

/**
 * Static design target for Player Detail (Option C). Dev-only route.
 * `/dev/player-detail-modal-design`
 */
export default function PlayerDetailModalDesignMockPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        margin: 0,
        background: "#07060b",
        color: "#c4bdd8",
        fontFamily: "var(--app-font-family, system-ui, sans-serif)",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #2a2438",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: "0.85rem" }}>
          Player Detail — design mock (static). Production modal unchanged.
        </span>
        <Link
          to="/dev/player-detail-modal-mock"
          style={{ color: "#9d8cc4", fontSize: "0.85rem" }}
        >
          ← Previous modal mock
        </Link>
      </div>
      <PlayerDetailModalDesignMock />
    </div>
  );
}
