import { Database, Star, BarChart3, GitCompare } from "lucide-react";
import "./ResearchSidebar.css";

interface ResearchSidebarProps {
  selectedView: string;
  onSelectView: (view: string) => void;
}

export default function ResearchSidebar({ selectedView, onSelectView }: ResearchSidebarProps) {
  const navigationItems = [
    { id: "player-database", label: "Player Database", icon: Database },
    { id: "watchlists", label: "Watchlists", icon: Star },
    { id: "rankings", label: "Rankings", icon: BarChart3 },
    { id: "compare", label: "Compare", icon: GitCompare },
  ];

  return (
    <div className="research-sidebar">
      <div className="sidebar-section">
        <h3 className="sidebar-section-title">NAVIGATION</h3>
        <div className="sidebar-nav">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`sidebar-nav-item ${selectedView === item.id ? "active" : ""}`}
                onClick={() => onSelectView(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="sidebar-section">
        <h3 className="sidebar-section-title">STAT BASIS</h3>
        <div className="sidebar-nav">
          <button className="sidebar-nav-item active">
            Projections
          </button>
          <button className="sidebar-nav-item">
            Last Year
          </button>
          <button className="sidebar-nav-item">
            3-Year Avg
          </button>
        </div>
      </div>
    </div>
  );
}
