import type { ReactNode } from "react";
import { ENGINE_TIER_METADATA_TOOLTIP } from "../domain/displayTiers";

export type ResearchPlayerMetaBadgeItem = { key: string; node: ReactNode };

export function buildResearchPlayerMetaBadgeItems(params: {
  tags: readonly string[];
  isCustom: boolean;
  draftedTeamName?: string;
  draftedContractLabel?: string;
  /** Engine auction tier when it differs from the Tiers page display tier. */
  engineAuctionTier?: string | number;
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
  if (params.engineAuctionTier != null) {
    const n =
      typeof params.engineAuctionTier === "number"
        ? params.engineAuctionTier
        : Number(params.engineAuctionTier);
    if (Number.isFinite(n)) {
      items.push({
        key: "engine-tier",
        node: (
          <span
            className="tag tag--engine-tier"
            title={ENGINE_TIER_METADATA_TOOLTIP}
          >
            Engine T{n}
          </span>
        ),
      });
    }
  }
  return items;
}

export function ResearchPlayerMetaBadges({
  items,
}: {
  items: readonly ResearchPlayerMetaBadgeItem[];
}) {
  if (items.length === 0) return null;
  /** Only swap to the compact strip when 3+ meta chips — avoids "+1" after a single extra tag. */
  const collapsible = items.length > 2;
  const overflowCount = items.length > 2 ? items.length - 2 : 0;
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
            {items.slice(0, 2).map((it) => (
              <span key={it.key}>{it.node}</span>
            ))}
            <span className="tag tag--overflow" title={`${overflowCount} more`}>
              +{overflowCount}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
