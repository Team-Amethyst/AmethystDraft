/**
 * Shared title + intro block for each step of the create/edit league wizard.
 */
export function LeagueCreateStepHeader({
  title,
  lead,
  variant = "default",
}: {
  title: string;
  lead: string;
  variant?: "default" | "keepers";
}) {
  return (
    <div
      className={
        "league-create-card-header" +
        (variant === "keepers"
          ? " league-create-card-header--keepers"
          : "")
      }
    >
      <h2>{title}</h2>
      <p
        className={
          "lc-flow-intro" +
          (variant === "keepers" ? " lc-flow-intro--tight" : "")
        }
      >
        {lead}
      </p>
    </div>
  );
}
