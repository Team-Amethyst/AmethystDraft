/** Default 5×5-style cats when league has no custom scoring list. */
export const COMMAND_CENTER_FALLBACK_SCORING_CATS: {
  name: string;
  type: "batting" | "pitching";
}[] = [
  { name: "HR", type: "batting" },
  { name: "RBI", type: "batting" },
  { name: "SB", type: "batting" },
  { name: "AVG", type: "batting" },
  { name: "W", type: "pitching" },
  { name: "SV", type: "pitching" },
  { name: "ERA", type: "pitching" },
  { name: "WHIP", type: "pitching" },
];
