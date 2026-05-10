import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** Visible stat-category chips (HR+, AVG+, …); overflow collapsed into +k. */
const MAX_VISIBLE_CATEGORY_TAGS = 3;

function CategoryTraitChips({ tags }: { tags: string[] }) {
  const shown = tags.slice(0, MAX_VISIBLE_CATEGORY_TAGS);
  const rest = tags.length - shown.length;
  return (
    <>
      {shown.map((t) => (
        <span key={t} className="tag">
          {t}
        </span>
      ))}
      {rest > 0 ? (
        <span
          className="tag tag--overflow"
          title={tags.slice(MAX_VISIBLE_CATEGORY_TAGS).join(", ")}
        >
          +{rest}
        </span>
      ) : null}
    </>
  );
}

type TraitMode = "full" | "count" | "none";

function parseGapPx(el: HTMLElement | null): number {
  if (!el) return 6;
  const g = getComputedStyle(el).gap;
  const raw = (g || "6px").split(/\s+/)[0] ?? "6px";
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 6;
}

function sumWithGaps(widths: number[], gapPx: number): number {
  const w = widths.filter((x) => x > 0);
  if (w.length === 0) return 0;
  const gaps = Math.max(0, w.length - 1);
  return w.reduce((a, b) => a + b, 0) + gaps * gapPx;
}

function pickTraitMode(
  avail: number,
  customW: number,
  draftW: number,
  fullW: number,
  countW: number,
  tagsLen: number,
  gapPx: number,
): TraitMode {
  if (tagsLen === 0 || avail <= 0) return "none";

  const needFull = sumWithGaps([customW, fullW, draftW], gapPx);
  if (needFull <= avail + 1) return "full";

  const needCount = sumWithGaps([customW, countW, draftW], gapPx);
  if (needCount <= avail + 1) return "count";

  return "none";
}

export function ResearchPlayerMetaTags({
  tags,
  showCustom,
  draftedTeamName,
  draftedContractLabel,
}: {
  tags: string[];
  showCustom: boolean;
  draftedTeamName?: string;
  draftedContractLabel?: string;
}) {
  const metaRef = useRef<HTMLDivElement>(null);
  const fullMeasureRef = useRef<HTMLDivElement>(null);
  const countMeasureRef = useRef<HTMLSpanElement>(null);
  const customRef = useRef<HTMLSpanElement>(null);
  const draftRef = useRef<HTMLDivElement>(null);

  const [traitMode, setTraitMode] = useState<TraitMode>(() =>
    tags.length === 0 ? "none" : "full",
  );

  const recompute = useCallback(() => {
    const meta = metaRef.current;
    const fullW = fullMeasureRef.current?.offsetWidth ?? 0;
    const countW = countMeasureRef.current?.offsetWidth ?? 0;
    const customW = showCustom ? (customRef.current?.offsetWidth ?? 0) : 0;
    const draftW = draftRef.current?.offsetWidth ?? 0;

    if (!meta || tags.length === 0) {
      setTraitMode("none");
      return;
    }

    const avail = meta.clientWidth;
    if (avail <= 0) return;

    const gapPx = parseGapPx(meta);

    setTraitMode(
      pickTraitMode(avail, customW, draftW, fullW, countW, tags.length, gapPx),
    );
  }, [showCustom, tags]);

  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => {
      recompute();
    });
    return () => cancelAnimationFrame(id);
  }, [recompute, tags, draftedTeamName, draftedContractLabel]);

  useLayoutEffect(() => {
    const meta = metaRef.current;
    if (!meta) return;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        recompute();
      });
    });
    ro.observe(meta);
    return () => ro.disconnect();
  }, [recompute]);

  const metaTitle =
    tags.length > 0 && traitMode !== "full" ? tags.join(" · ") : undefined;

  const hasDrafted =
    Boolean(draftedTeamName) || Boolean(draftedContractLabel);

  return (
    <>
      {tags.length > 0 ? (
        <div
          className="pt-trait-measure-host"
          aria-hidden
          style={{
            position: "absolute",
            left: -9999,
            top: 0,
            visibility: "hidden",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          <div
            ref={fullMeasureRef}
            className="tag-list"
            style={{ display: "inline-flex", width: "max-content" }}
          >
            <CategoryTraitChips tags={tags} />
          </div>
          <span
            ref={countMeasureRef}
            className="tag tag--overflow pt-trait-count-only"
            style={{ display: "inline-block" }}
          >
            +{tags.length}
          </span>
        </div>
      ) : null}

      <div ref={metaRef} className="pt-meta-tags" title={metaTitle}>
        {showCustom && (
          <span ref={customRef} className="custom-badge">
            Custom
          </span>
        )}

        {traitMode === "full" && tags.length > 0 && (
          <div className="tag-list pt-category-tags">
            <CategoryTraitChips tags={tags} />
          </div>
        )}

        {traitMode === "count" && tags.length > 0 && (
          <span className="tag tag--overflow pt-trait-count-only" title={tags.join(", ")}>
            +{tags.length}
          </span>
        )}

        {hasDrafted && (
          <div ref={draftRef} className="tag-list pt-draft-tags">
            {draftedTeamName && (
              <span className="tag pt-drafted-tag">▶ {draftedTeamName}</span>
            )}
            {draftedContractLabel && (
              <span className="tag pt-drafted-contract-tag">
                {draftedContractLabel}
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );
}
