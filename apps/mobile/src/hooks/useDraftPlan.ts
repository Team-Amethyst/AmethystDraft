import { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Priority = "High" | "Medium" | "Low";

export type PositionPlanRow = {
  pos: string;
  slots: number;
  target: number;
};

export const POSITION_PLAN: PositionPlanRow[] = [
  { pos: "C", slots: 1, target: 14 },
  { pos: "1B", slots: 1, target: 28 },
  { pos: "2B", slots: 1, target: 22 },
  { pos: "SS", slots: 1, target: 25 },
  { pos: "3B", slots: 1, target: 24 },
  { pos: "OF", slots: 3, target: 44 },
  { pos: "SP", slots: 2, target: 60 },
  { pos: "RP", slots: 2, target: 20 },
  { pos: "UTIL", slots: 1, target: 15 },
  { pos: "BN", slots: 4, target: 8 },
];

export const POS_COLORS: Record<string, string> = {
  C: "#f87171",
  "1B": "#fbbf24",
  "2B": "#38bdf8",
  SS: "#22d3ee",
  "3B": "#fb923c",
  OF: "#4ade80",
  SP: "#818cf8",
  RP: "#f472b6",
  UTIL: "#94a3b8",
  BN: "#6b7280",
};

function defaultPositionTargets(): Record<string, number> {
  return Object.fromEntries(POSITION_PLAN.map((row) => [row.pos, row.target]));
}

export function useDraftPlan(leagueId: string) {
  const [positionTargets, setPositionTargets] = useState<Record<string, number>>(
    defaultPositionTargets(),
  );
  const [targetOverrides, setTargetOverrides] = useState<Record<string, number>>(
    {},
  );
  const [priorityOverrides, setPriorityOverrides] = useState<
    Record<string, Priority>
  >({});

  useEffect(() => {
    async function loadPlannerState() {
      try {
        const targetsRaw = await AsyncStorage.getItem(
          `mydraft:${leagueId}:positionTargets`,
        );
        const targetOverridesRaw = await AsyncStorage.getItem(
          `mydraft:${leagueId}:targetOverrides`,
        );
        const priorityOverridesRaw = await AsyncStorage.getItem(
          `mydraft:${leagueId}:priorityOverrides`,
        );

        setPositionTargets({
          ...defaultPositionTargets(),
          ...(targetsRaw ? (JSON.parse(targetsRaw) as Record<string, number>) : {}),
        });

        setTargetOverrides(
          targetOverridesRaw
            ? (JSON.parse(targetOverridesRaw) as Record<string, number>)
            : {},
        );

        setPriorityOverrides(
          priorityOverridesRaw
            ? (JSON.parse(priorityOverridesRaw) as Record<string, Priority>)
            : {},
        );
      } catch {
        setPositionTargets(defaultPositionTargets());
        setTargetOverrides({});
        setPriorityOverrides({});
      }
    }

    void loadPlannerState();
  }, [leagueId]);

  async function savePositionTargets(next: Record<string, number>) {
    setPositionTargets(next);
    await AsyncStorage.setItem(
      `mydraft:${leagueId}:positionTargets`,
      JSON.stringify(next),
    );
  }

  async function saveTargetOverrides(next: Record<string, number>) {
    setTargetOverrides(next);
    await AsyncStorage.setItem(
      `mydraft:${leagueId}:targetOverrides`,
      JSON.stringify(next),
    );
  }

  async function savePriorityOverrides(next: Record<string, Priority>) {
    setPriorityOverrides(next);
    await AsyncStorage.setItem(
      `mydraft:${leagueId}:priorityOverrides`,
      JSON.stringify(next),
    );
  }

  const allocationRows = useMemo(() => {
    return POSITION_PLAN.map((row) => ({
      ...row,
      target: positionTargets[row.pos] ?? row.target,
      color: POS_COLORS[row.pos] ?? "#9ca3af",
    }));
  }, [positionTargets]);

  return {
    positionTargets,
    targetOverrides,
    priorityOverrides,
    setPositionTargets: savePositionTargets,
    setTargetOverrides: saveTargetOverrides,
    setPriorityOverrides: savePriorityOverrides,
    allocationRows,
  };
}