import type { NewsSignal, NewsSignalType } from "../../api/engine";

export type IntelligenceAlertFilter = "all" | NewsSignalType;

/** Filter pills → API `signal_type`; labels match product copy. */
export const INTELLIGENCE_ALERT_FILTER_TABS: readonly {
  id: IntelligenceAlertFilter;
  label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "injury", label: "Injuries" },
  { id: "role_change", label: "Role" },
  { id: "trade", label: "Trades" },
  { id: "promotion", label: "Promotions" },
  { id: "demotion", label: "Demotions" },
];

export function signalTypeForApiFilter(
  filter: IntelligenceAlertFilter,
): NewsSignalType | undefined {
  return filter === "all" ? undefined : filter;
}

export function formatNewsEffectiveRelative(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return "Just now";
  const diffMinutes = Math.floor((Date.now() - parsed.getTime()) / 60000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function formatNewsSignalTypeBadge(signalType: NewsSignalType): string {
  switch (signalType) {
    case "injury":
      return "Injury";
    case "role_change":
      return "Role";
    case "trade":
      return "Trade";
    case "promotion":
      return "Promotion";
    case "demotion":
      return "Demotion";
    default:
      return signalType;
  }
}

export function formatSeverityBadge(severity: NewsSignal["severity"]): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

/** Visual grouping for card accent borders (unchanged semantics). */
export function newsSignalVisualKind(signalType: NewsSignalType): "injury" | "trade" | "structural" {
  if (signalType === "injury") return "injury";
  if (signalType === "trade") return "trade";
  return "structural";
}
