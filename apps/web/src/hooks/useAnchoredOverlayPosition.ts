import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

type AnchoredOverlayOptions = {
  gap?: number;
  align?: "left" | "right";
  maxWidth?: number;
  /** Portaled panel element — measured after mount for accurate placement. */
  floatingRef?: RefObject<HTMLElement | null>;
  /** Fallback height before measure (e.g. option count × row height). */
  estimatedItemCount?: number;
  /** Row height in px (default ≈ compact select row). */
  estimatedItemHeight?: number;
  estimatedPadding?: number;
  /** Cap pre-measure height (matches AppSelect menu max-height). */
  maxEstimatedHeight?: number;
};

function resolveMenuHeight(
  measuredHeight: number,
  estimatedItemCount: number | undefined,
  estimatedItemHeight: number,
  estimatedPadding: number,
  maxEstimatedHeight: number,
): number {
  const estimatedHeight =
    estimatedItemCount != null && estimatedItemCount > 0
      ? Math.min(
          estimatedItemCount * estimatedItemHeight + estimatedPadding,
          maxEstimatedHeight,
        )
      : 0;

  if (measuredHeight > 0) return measuredHeight;
  if (estimatedHeight > 0) return estimatedHeight;
  return 120;
}

/**
 * Fixed viewport position for a popover anchored to a trigger (escapes overflow scroll parents).
 */
export function useAnchoredOverlayPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  options: AnchoredOverlayOptions = {},
): CSSProperties {
  const {
    gap = 4,
    align = "left",
    maxWidth,
    floatingRef,
    estimatedItemCount,
    estimatedItemHeight = 26,
    estimatedPadding = 10,
    maxEstimatedHeight = 256,
  } = options;
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open) {
      setStyle({});
      return;
    }

    let cancelled = false;

    const compute = () => {
      if (cancelled) return;
      const anchor = anchorRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const viewportPad = 8;
      const cap =
        maxWidth ?? Math.min(320, window.innerWidth - viewportPad * 2);
      const width = Math.max(
        rect.width,
        Math.min(cap, window.innerWidth - viewportPad * 2),
      );

      let left = align === "right" ? rect.right - width : rect.left;
      left = Math.max(
        viewportPad,
        Math.min(left, window.innerWidth - width - viewportPad),
      );

      const measuredHeight =
        floatingRef?.current?.getBoundingClientRect().height ?? 0;
      const menuHeight = resolveMenuHeight(
        measuredHeight,
        estimatedItemCount,
        estimatedItemHeight,
        estimatedPadding,
        maxEstimatedHeight,
      );

      const spaceBelow = window.innerHeight - viewportPad - (rect.bottom + gap);
      const spaceAbove = rect.top - gap - viewportPad;

      let top: number;
      if (spaceBelow >= menuHeight) {
        top = rect.bottom + gap;
      } else if (spaceAbove >= menuHeight) {
        top = rect.top - gap - menuHeight;
      } else if (spaceBelow >= spaceAbove) {
        top = rect.bottom + gap;
      } else {
        top = rect.top - gap - menuHeight;
      }

      top = Math.max(
        viewportPad,
        Math.min(top, window.innerHeight - viewportPad - menuHeight),
      );

      setStyle({
        position: "fixed",
        top,
        left,
        minWidth: rect.width,
        width: "max-content",
        maxWidth: width,
        zIndex: 3000,
      });
    };

    compute();

    let rafFrames = 0;
    const rafLoop = () => {
      if (cancelled) return;
      compute();
      if (++rafFrames < 4) requestAnimationFrame(rafLoop);
    };
    requestAnimationFrame(rafLoop);

    let floatObserver: ResizeObserver | null = null;
    const observeFloating = () => {
      const floated = floatingRef?.current;
      if (!floated || typeof ResizeObserver === "undefined") return false;
      floatObserver?.disconnect();
      floatObserver = new ResizeObserver(compute);
      floatObserver.observe(floated);
      return true;
    };

    if (!observeFloating()) {
      let polls = 0;
      const pollFloating = () => {
        if (cancelled) return;
        if (observeFloating() || ++polls >= 12) return;
        requestAnimationFrame(pollFloating);
      };
      requestAnimationFrame(pollFloating);
    }

    let anchorObserver: ResizeObserver | null = null;
    const anchor = anchorRef.current;
    if (anchor && typeof ResizeObserver !== "undefined") {
      anchorObserver = new ResizeObserver(compute);
      anchorObserver.observe(anchor);
    }

    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      cancelled = true;
      floatObserver?.disconnect();
      anchorObserver?.disconnect();
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [
    open,
    anchorRef,
    floatingRef,
    gap,
    align,
    maxWidth,
    estimatedItemCount,
    estimatedItemHeight,
    estimatedPadding,
    maxEstimatedHeight,
  ]);

  return open ? style : {};
}
