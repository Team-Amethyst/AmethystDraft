/** Rows that include every selected tag (AND semantics). */
export function playerTableRowsMatchingTagFilter<
  T extends { tags: string[] },
>(rows: T[], selectedTags: ReadonlySet<string>): T[] {
  if (selectedTags.size === 0) return rows;
  return rows.filter((r) =>
    [...selectedTags].every((t) => r.tags.includes(t)),
  );
}
