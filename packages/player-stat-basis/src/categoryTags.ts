import type { DisplayBatting, DisplayPitching } from "./types";

export function getCategoryTags(
  bat: DisplayBatting | undefined,
  pit: DisplayPitching | undefined,
): string[] {
  const tags: string[] = [];

  if (bat) {
    if (bat.hr >= 25) tags.push("HR+");
    if (bat.sb >= 15) tags.push("SB+");
    if (parseFloat(bat.avg) >= 0.285) tags.push("AVG+");
    if (bat.runs >= 85) tags.push("R+");
    if (bat.rbi >= 85) tags.push("RBI+");
  }
  if (pit) {
    if (pit.strikeouts >= 175) tags.push("K+");
    if (pit.wins >= 10) tags.push("W+");
    if (pit.saves >= 20) tags.push("SV+");
  }
  return tags;
}
