import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

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

/**
 * How many leading category tags to show before a +x chip:
 * - tags.length → all tags fit (no +x)
 * - 1..tags.length-1 → first n tags + "+rest"
 * - 0 → only "+total" fits
 * - -1 → hide category row entirely (tooltip still on meta when tags exist)
 */
type VisibleTagFit = number;

export function ResearchPlayerMetaTags({
  tags,
  showCustom,
  draftedTeamName,
  draftedContractLabel,
  /** Bumped when the table scroll area resizes so rows refit without per-row ResizeObservers. */
  layoutTick = 0,
}: {
  tags: string[];
  showCustom: boolean;
  draftedTeamName?: string;
  draftedContractLabel?: string;
  layoutTick?: number;
}) {
  const metaRef = useRef<HTMLDivElement>(null);
  const probeHostRef = useRef<HTMLDivElement>(null);
  const customRef = useRef<HTMLSpanElement>(null);
  const draftRef = useRef<HTMLDivElement>(null);
  const zeroAvailRetriesRef = useRef(0);

  const [visibleFit, setVisibleFit] = useState<VisibleTagFit>(() =>
    tags.length === 0 ? -1 : tags.length,
  );

  const recompute = useCallback(() => {
    const meta = metaRef.current;
    const host = probeHostRef.current;
    const customW = showCustom ? (customRef.current?.offsetWidth ?? 0) : 0;
    const draftW = draftRef.current?.offsetWidth ?? 0;

    if (!meta || tags.length === 0) {
      setVisibleFit(-1);
      return;
    }

    const avail = meta.clientWidth;
    // First paint can report 0 before flex/table layout settles — retry briefly.
    if (avail <= 0) {
      if (zeroAvailRetriesRef.current < 5) {
        zeroAvailRetriesRef.current += 1;
        requestAnimationFrame(() => {
          recompute();
        });
      }
      return;
    }
    zeroAvailRetriesRef.current = 0;

    const gapPx = parseGapPx(meta);

    const rowWidth = (v: number): number => {
      const el = host?.querySelector(
        `[data-fit-v="${v}"]`,
      ) as HTMLElement | null;
      return el?.offsetWidth ?? 99999;
    };

    const overflowOnlyW =
      (host?.querySelector("[data-fit-overflow-only]") as HTMLElement | null)
        ?.offsetWidth ?? 99999;

    for (let v = tags.length; v >= 1; v--) {
      const rw = rowWidth(v);
      const need = sumWithGaps([customW, rw, draftW], gapPx);
      if (need <= avail + 1) {
        setVisibleFit(v);
        return;
      }
    }

    const needOverflowOnly = sumWithGaps(
      [customW, overflowOnlyW, draftW],
      gapPx,
    );
    if (needOverflowOnly <= avail + 1) {
      setVisibleFit(0);
      return;
    }

    setVisibleFit(-1);
  }, [showCustom, tags]);

  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => {
      recompute();
    });
    return () => cancelAnimationFrame(id);
  }, [
    recompute,
    tags,
    draftedTeamName,
    draftedContractLabel,
    showCustom,
    layoutTick,
  ]);

  const metaTitle =
    tags.length > 0 && visibleFit !== tags.length ? tags.join(" · ") : undefined;

  const hasDrafted =
    Boolean(draftedTeamName) || Boolean(draftedContractLabel);

  return (
    <>
      {tags.length > 0 ? (
        <div
          ref={probeHostRef}
          className="pt-trait-fit-probes"
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
          {Array.from({ length: tags.length }, (_, i) => {
            const v = i + 1;
            return (
              <div
                key={v}
                data-fit-v={v}
                className="tag-list pt-category-tags"
                style={{ display: "inline-flex", width: "max-content" }}
              >
                {tags.slice(0, v).map((t, ti) => (
                  <span key={`${v}-${ti}`} className="tag">
                    {t}
                  </span>
                ))}
                {v < tags.length ? (
                  <span className="tag tag--overflow">
                    +{tags.length - v}
                  </span>
                ) : null}
              </div>
            );
          })}
          <div
            data-fit-overflow-only
            className="tag-list pt-category-tags"
            style={{ display: "inline-flex", width: "max-content" }}
          >
            <span className="tag tag--overflow">+{tags.length}</span>
          </div>
        </div>
      ) : null}

      <div ref={metaRef} className="pt-meta-tags" title={metaTitle}>
        {showCustom && (
          <span ref={customRef} className="custom-badge">
            Custom
          </span>
        )}

        {tags.length > 0 && visibleFit > 0 && (
          <div className="tag-list pt-category-tags">
            {tags.slice(0, visibleFit).map((t, i) => (
              <span key={i} className="tag">
                {t}
              </span>
            ))}
            {visibleFit < tags.length ? (
              <span
                className="tag tag--overflow"
                title={tags.slice(visibleFit).join(", ")}
              >
                +{tags.length - visibleFit}
              </span>
            ) : null}
          </div>
        )}

        {tags.length > 0 && visibleFit === 0 && (
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
