import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { RESEARCH_POSITION_FILTER_STORAGE_KEY } from "../constants/researchStorage";

export function useResearchPositionFilter(): [
  string,
  Dispatch<SetStateAction<string>>,
] {
  const [positionFilter, setPositionFilter] = useState(() => {
    try {
      return (
        localStorage.getItem(RESEARCH_POSITION_FILTER_STORAGE_KEY) ?? "all"
      );
    } catch {
      return "all";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        RESEARCH_POSITION_FILTER_STORAGE_KEY,
        positionFilter,
      );
    } catch {
      /* noop */
    }
  }, [positionFilter]);

  return [positionFilter, setPositionFilter];
}
