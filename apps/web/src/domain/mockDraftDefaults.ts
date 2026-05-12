/**
 * Fallback league shape when mock draft runs before full league config exists.
 */
export const MOCK_DRAFT_DEFAULT_ROSTER_SLOTS: Record<string, number> = {
  C: 1,
  "1B": 1,
  "2B": 1,
  SS: 1,
  "3B": 1,
  OF: 3,
  UTIL: 1,
  SP: 2,
  RP: 2,
  BN: 4,
};

export const MOCK_DRAFT_DEFAULT_BUDGET = 260;
