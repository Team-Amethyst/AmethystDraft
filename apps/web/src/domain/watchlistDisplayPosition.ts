/** First token of a slash/comma position string for compact watchlist display. */
export function watchlistPrimaryPositionToken(position: string): string {
  return (
    position.toUpperCase().replace(/\s+/g, "").split(/[/,|-]/)[0] || "UTIL"
  );
}
