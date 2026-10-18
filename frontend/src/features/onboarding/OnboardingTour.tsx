import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { cn } from "@/shared/utils/cn";

import { STEPS } from "./steps";
import { useTour } from "./store";

const TOOLTIP_WIDTH = 340;
const TOOLTIP_GAP = 16;
const HIGHLIGHT_PADDING = 8;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function OnboardingTour() {
  const nav = useNavigate();
  const location = useLocation();
  const { active, stepIndex, next, prev, skip, goTo } = useTour();

  const [rect, setRect] = useState<Rect | null>(null);
  const step = STEPS[stepIndex];

  // Make sure the target is on the current page
  useEffect(() => {
    if (!active) return;
    if (location.pathname !== "/home") {
      nav("/home", { replace: false });
    }
  }, [active, location.pathname, nav]);

  // Locate the target and track its position.
  //
  // On step change:
  //   1. If the target is off-screen, scroll it into view (smooth)
  //   2. Continuously track its position during the scroll (via scroll
  //      events + a short poll for browsers that don't fire scroll events
  //      for nested scroll containers)
  useEffect(() => {
    if (!active || !step) return;

    let cancelled = false;
    let raf = 0;
    let pollId: number | null = null;

    const updateRect = () => {
      if (cancelled) return;
      if (!step.target) {
        setRect(null);
        return;
      }
      const el = document.querySelector<HTMLElement>(step.target);
      if (!el) {
        raf = requestAnimationFrame(updateRect);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      });
    };

    // Step 1: bring the target into view if it's outside the current viewport
    if (step.target) {
      const el = document.querySelector<HTMLElement>(step.target);
      if (el) {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        const buffer = 100; // breathing room so the tooltip fits on the top/bottom
        const fullyVisible =
          r.top >= buffer &&
          r.bottom <= vh - buffer &&
          r.left >= 0 &&
          r.right <= vw;

        if (!fullyVisible) {
          el.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });
        }
      }
    }

    // Step 2: track position immediately (even if a smooth scroll just started)
    updateRect();

    // Step 3: keep tracking via scroll + resize events (capture phase so we
    // catch scrolls from nested scroll containers like the Home page)
    const onScrollOrResize = () => updateRect();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);

    // Step 4: belt-and-suspenders — poll for ~1.5s to cover the smooth
    // scroll animation in case scroll events don't fire in time
    pollId = window.setInterval(updateRect, 60);
    const stopPoll = window.setTimeout(() => {
      if (pollId !== null) {
        window.clearInterval(pollId);
        pollId = null;
      }
    }, 1500);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
      if (pollId !== null) window.clearInterval(pollId);
      window.clearTimeout(stopPoll);
    };
  }, [active, step, stepIndex]);

  // Keyboard nav
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        skip();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [active, next, prev, skip]);

  if (!active || !step) return null;

  const isCentered = !rect;
  const tooltip = computeTooltipPosition(rect, step.placement);

  return (
    <>
      {/* Spotlight highlight (creates the dim overlay via box-shadow) */}
      {rect && (
        <div
          className="fixed z-[200] rounded-xl pointer-events-none transition-all duration-300"
          style={{
            top: rect.top - HIGHLIGHT_PADDING,
            left: rect.left - HIGHLIGHT_PADDING,
            width: rect.width + HIGHLIGHT_PADDING * 2,
            height: rect.height + HIGHLIGHT_PADDING * 2,
            boxShadow: "0 0 0 9999px rgba(3,7,18,.72)",
            border: "2px solid #22D3EE",
            outline: "1px solid rgba(34,211,238,.35)",
            outlineOffset: "4px",
          }}
        />
      )}

      {/* Centered dim for the modal steps */}
      {isCentered && (
        <div
          className="fixed inset-0 z-[200]"
          style={{ background: "rgba(3,7,18,.72)", backdropFilter: "blur(4px)" }}
        />
      )}

      {/* Interactive blocker — prevents clicking the spotlighted UI */}
      <div className="fixed inset-0 z-[201]" />

      {/* Tooltip */}
      <div
        className="fixed z-[202] fade-up"
        style={{
          top: tooltip.top,
          left: tooltip.left,
          width: TOOLTIP_WIDTH,
        }}
      >
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "var(--aida-glass-strong)",
            backdropFilter: "blur(28px) saturate(150%)",
            WebkitBackdropFilter: "blur(28px) saturate(150%)",
            border: "1px solid rgba(34,211,238,.4)",
            boxShadow:
              "0 30px 80px -12px rgba(0,0,0,.85), 0 0 40px -8px rgba(34,211,238,.25)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3 border-b"
            style={{ borderColor: "var(--aida-border)" }}
          >
            <div
              className="w-6 h-6 rounded-md grid place-items-center font-mono text-[10px] font-bold flex-none"
              style={{
                background: "linear-gradient(135deg,#22D3EE,#8B5CF6)",
                color: "#04121A",
              }}
            >
              {stepIndex + 1}
            </div>
            <div className="text-[13.5px] font-medium truncate">
              {step.title}
            </div>
            <button
              type="button"
              onClick={skip}
              className="ml-auto text-muted hover:text-txt cursor-pointer focusable p-1"
              aria-label="Skip tour"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>

          {/* Body */}
          <div className="px-4 py-4 text-[13px] leading-relaxed text-muted">
            {step.body}
          </div>

          {/* Footer */}
          <div
            className="flex items-center gap-2 px-4 py-3 border-t"
            style={{ borderColor: "var(--aida-border)" }}
          >
            {/* Progress dots */}
            <div className="flex items-center gap-1">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => goTo(i)}
                  className="rounded-full transition-all cursor-pointer"
                  style={{
                    width: i === stepIndex ? 16 : 6,
                    height: 6,
                    background:
                      i === stepIndex
                        ? "#22D3EE"
                        : "rgba(148,163,184,.35)",
                  }}
                  aria-label={`Go to step ${i + 1}`}
                />
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={prev}
                  className="btn-chip focusable cursor-pointer"
                >
                  <ChevronLeft size={10} strokeWidth={2.5} />
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={next}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer focusable",
                )}
                style={{
                  background: "linear-gradient(180deg,#22D3EE,#0EA5C4)",
                  color: "#04121A",
                }}
              >
                {stepIndex === STEPS.length - 1 ? "Done" : "Next"}
                {stepIndex < STEPS.length - 1 && (
                  <ChevronRight size={11} strokeWidth={2.5} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Position helper ─────────────────────────────────────── */

function computeTooltipPosition(
  rect: Rect | null,
  placement: "top" | "bottom" | "left" | "right" | "center" | undefined,
): { top: number; left: number } {
  if (!rect) {
    // Center of viewport
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      top: Math.max(24, vh / 2 - 120),
      left: Math.max(16, vw / 2 - TOOLTIP_WIDTH / 2),
    };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tooltipHeight = 190; // approximate — good enough for positioning

  // Preferred side from the step, falling back to the roomiest side
  let side = placement ?? "bottom";
  if (side === "center") side = "bottom";

  const room = {
    top: rect.top,
    bottom: vh - (rect.top + rect.height),
    left: rect.left,
    right: vw - (rect.left + rect.width),
  };

  const fits = {
    top: room.top >= tooltipHeight + TOOLTIP_GAP,
    bottom: room.bottom >= tooltipHeight + TOOLTIP_GAP,
    left: room.left >= TOOLTIP_WIDTH + TOOLTIP_GAP,
    right: room.right >= TOOLTIP_WIDTH + TOOLTIP_GAP,
  };

  if (!fits[side as keyof typeof fits]) {
    // Pick the roomiest side that fits
    const order: Array<"bottom" | "top" | "right" | "left"> = [
      "bottom",
      "top",
      "right",
      "left",
    ];
    side = order.find((s) => fits[s]) ?? "bottom";
  }

  let top = 0;
  let left = 0;

  if (side === "bottom") {
    top = rect.top + rect.height + TOOLTIP_GAP;
    left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
  } else if (side === "top") {
    top = rect.top - tooltipHeight - TOOLTIP_GAP;
    left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
  } else if (side === "right") {
    top = rect.top + rect.height / 2 - tooltipHeight / 2;
    left = rect.left + rect.width + TOOLTIP_GAP;
  } else {
    // left
    top = rect.top + rect.height / 2 - tooltipHeight / 2;
    left = rect.left - TOOLTIP_WIDTH - TOOLTIP_GAP;
  }

  // Clamp to viewport
  top = Math.max(16, Math.min(vh - tooltipHeight - 16, top));
  left = Math.max(16, Math.min(vw - TOOLTIP_WIDTH - 16, left));

  return { top, left };
}