/**
 * Command Center purchase callout — readable in ~2s, separate from dollar tiles.
 */
export type CommandCenterActionVerdict = {
  kind: "fair" | "target" | "value" | "reach" | "avoid";
  label: string;
  hint: string;
};

export function commandCenterActionVerdict(params: {
  notBidable: boolean;
  notBidableReason: string | null;
  leagueFmv: number | null;
  suggestedBid: number | null;
  teamValue: number | null;
  bidEdge: number | undefined;
  budgetLimited?: boolean;
}): CommandCenterActionVerdict {
  const {
    notBidable,
    notBidableReason,
    leagueFmv,
    suggestedBid,
    teamValue,
    bidEdge,
    budgetLimited,
  } = params;

  if (notBidable) {
    return {
      kind: "avoid",
      label: "Avoid",
      hint:
        notBidableReason ??
        "No executable budget or open active slots for the selected team.",
    };
  }

  if (budgetLimited) {
    return {
      kind: "target",
      label: "Budget cap",
      hint: "Suggested bid is limited by remaining budget and open roster spots.",
    };
  }

  if (
    leagueFmv != null &&
    suggestedBid != null &&
    suggestedBid >= leagueFmv + 12
  ) {
    return {
      kind: "reach",
      label: "Reach",
      hint: `Suggested bid is about $${Math.round(suggestedBid - leagueFmv)} above league FMV—pay up only for a must-have fit.`,
    };
  }

  if (bidEdge != null && bidEdge < -8) {
    return {
      kind: "reach",
      label: "Overpay risk",
      hint:
        teamValue != null
          ? "Suggested bid is at or above what this player is worth to your roster."
          : "Little margin versus your team value at this price.",
    };
  }

  if (bidEdge != null && bidEdge > 8) {
    return {
      kind: "value",
      label: "Good value",
      hint: "Suggested bid leaves meaningful room versus your team value.",
    };
  }

  if (
    leagueFmv != null &&
    suggestedBid != null &&
    Math.abs(suggestedBid - leagueFmv) <= 4
  ) {
    return {
      kind: "fair",
      label: "Fair value",
      hint: "Suggested bid is aligned with league fair market value.",
    };
  }

  return {
    kind: "target",
    label: "Target",
    hint: "Bid near the suggested offer unless nomination pace runs hot.",
  };
}
