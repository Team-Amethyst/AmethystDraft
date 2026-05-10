import { Link } from "react-router";
import PlayerDetailModalMock from "../../components/dev/PlayerDetailModalMock";

/**
 * Dev-only full-viewport preview of `PlayerDetailModalMock`.
 * Route: `/dev/player-detail-modal-mock` (registered only when `import.meta.env.DEV`).
 */
export default function PlayerDetailModalMockPage() {
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
          Static Player Detail modal mock — Option C split. No production code paths.
        </span>
        <Link
          to="/dev/player-detail-layout-mocks"
          style={{ color: "#9d8cc4", fontSize: "0.85rem" }}
        >
          ← Layout mocks index
        </Link>
      </div>
      <PlayerDetailModalMock />
    </div>
  );
}
