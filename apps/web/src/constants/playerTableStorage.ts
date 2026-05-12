/** localStorage keys for Player Table filter / sort persistence. */
export const PLAYER_TABLE_STORAGE_KEYS = {
  starred: "amethyst-pt-starred",
  injury: "amethyst-pt-injury",
  availability: "amethyst-pt-availability",
  tags: "amethyst-pt-tags",
  statView: "amethyst-pt-statview",
  sort: "amethyst-pt-sort",
  /** Research table: show model rank + tier columns (off by default). */
  researchModelColumns: "amethyst-pt-research-model-cols",
} as const;
