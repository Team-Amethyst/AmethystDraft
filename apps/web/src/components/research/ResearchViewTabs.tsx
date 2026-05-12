import { Database, BarChart3, Layers, UserPlus, type LucideIcon } from "lucide-react";

export type ResearchView = "player-database" | "tiers" | "depth-charts";

const NAV_ITEMS: Array<{
  id: ResearchView;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "player-database", label: "Players", icon: Database },
  { id: "tiers", label: "Tiers", icon: BarChart3 },
  { id: "depth-charts", label: "Depth Charts", icon: Layers },
];

interface ResearchViewTabsProps {
  selectedView: ResearchView;
  onSelectView: (view: ResearchView) => void;
  onOpenAddPlayer: () => void;
}

export function ResearchViewTabs({
  selectedView,
  onSelectView,
  onOpenAddPlayer,
}: ResearchViewTabsProps) {
  return (
    <div className="research-top-nav">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            className={`nav-tab ${selectedView === item.id ? "active" : ""}`}
            onClick={() => onSelectView(item.id)}
          >
            <Icon size={16} />
            <span>{item.label}</span>
          </button>
        );
      })}

      {selectedView === "player-database" && (
        <button
          type="button"
          className="nav-tab add-player-btn"
          onClick={onOpenAddPlayer}
          title="Add a player not found in the MLB data source"
        >
          <UserPlus size={16} />
          <span>Add Player</span>
        </button>
      )}
    </div>
  );
}
