import type { ResearchDraftedRowDisplay } from "../../domain/researchDraftedDisplay";

export function ResearchDraftedPaidCell({
  display,
}: {
  display: ResearchDraftedRowDisplay;
}) {
  const hasPrice = display.formattedPrice.length > 0;

  return (
    <span className="pt-research-draft-result" title={display.title}>
      <span className="pt-research-draft-result__team">{display.teamName}</span>
      {hasPrice ? (
        <>
          <span className="pt-research-draft-result__sep" aria-hidden="true">
            ·
          </span>
          <span className="pt-research-draft-result__price">
            {display.formattedPrice}
          </span>
        </>
      ) : null}
    </span>
  );
}
