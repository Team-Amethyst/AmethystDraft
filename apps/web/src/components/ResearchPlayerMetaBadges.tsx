import type { ReactNode } from "react";

export type ResearchPlayerMetaBadgeItem = { key: string; node: ReactNode };

export function buildResearchPlayerMetaBadgeItems(params: {
  tags: readonly string[];
  isCustom: boolean;
  draftedTeamName?: string;
  draftedContractLabel?: string;
}): ResearchPlayerMetaBadgeItem[] {
  const items: ResearchPlayerMetaBadgeItem[] = [];
  if (params.isCustom) {
    items.push({ key: "custom", node: <span className="tag">Custom</span> });
  }
  for (const tag of params.tags) {
    items.push({
      key: `tag:${tag}`,
      node: <span className="tag">{tag}</span>,
    });
  }
  if (params.draftedTeamName) {
    items.push({
      key: "drafted-team",
      node: (
        <span className="tag pt-drafted-tag" title="Drafted roster">
          {params.draftedTeamName}
        </span>
      ),
    });
  }
  if (params.draftedContractLabel) {
    items.push({
      key: "drafted-contract",
      node: (
        <span className="tag pt-drafted-contract-tag" title="Contract">
          {params.draftedContractLabel}
        </span>
      ),
    });
  }
  return items;
}

export function ResearchPlayerMetaBadges({
  items,
}: {
  items: readonly ResearchPlayerMetaBadgeItem[];
}) {
  if (items.length === 0) return null;
  const collapsible = items.length > 1;
  return (
    <div
      className={
        "pt-research-meta-badges" +
        (collapsible ? " pt-research-meta-badges--collapsible" : "")
      }
    >
      <div className="pt-research-meta-badges__cq">
        <div className="pt-research-meta-badges__full tag-list pt-category-tags">
          {items.map((it) => (
            <span key={it.key}>{it.node}</span>
          ))}
        </div>
        {collapsible ? (
          <div className="pt-research-meta-badges__compact tag-list pt-category-tags">
            <span key={items[0].key}>{items[0].node}</span>
            <span className="tag tag--overflow" aria-hidden="true">
              +{items.length - 1}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
