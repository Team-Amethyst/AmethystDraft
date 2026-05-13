/**
 * Native tooltip text for Research player cells — replaces inline trait/draft/custom
 * chips so the table avoids per-row layout measurement (ResizeObserver).
 */
export function researchPlayerCellTooltip(input: {
  playerName: string;
  tags: readonly string[];
  isCustom: boolean;
  draftedTeamName?: string;
  draftedContractLabel?: string;
  /** When true, Engine board columns are masked — omit draftable-pool hint. */
  maskEngineColumns: boolean;
  researchDraftable?: "draftable" | "outside" | "unknown";
}): string | undefined {
  const lines: string[] = [];
  if (input.isCustom) lines.push("Custom player");
  if (input.tags.length > 0) {
    lines.push(`Category tags: ${input.tags.join(" · ")}`);
  }
  if (input.draftedTeamName) {
    lines.push(`Drafted by ${input.draftedTeamName}`);
  }
  if (input.draftedContractLabel) {
    lines.push(input.draftedContractLabel);
  }
  if (!input.maskEngineColumns && input.researchDraftable === "outside") {
    lines.push(
      "Outside the Engine draftable pool for this league valuation",
    );
  }
  if (lines.length === 0) return undefined;
  return `${input.playerName}\n\n${lines.join("\n")}`;
}
