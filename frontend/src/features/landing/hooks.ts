/**
 * Landing-page-only hooks.
 *
 *  - useScrollReveal  → IntersectionObserver that adds `.revealed` when in view
 *  - useCountUp       → animates a number from 0 to `target` when triggered
 *  - useMousePosition → live cursor coordinates (throttled via rAF)
 *  - useScrollProgress → 0..1 progress of the whole document
 */
import { useEffect, useRef, useState } from "react";

// ── Scroll reveal ───────────────────────────────────────────

export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options: { threshold?: number; once?: boolean } = {},
) {
  const ref = useRef<T>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Fallback for very old browsers
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            if (options.once !== false) observer.disconnect();
          }
        }
      },
      {
        threshold: options.threshold ?? 0.12,
        rootMargin: "0px 0px -8% 0px",
      },
    );

    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ref, revealed };
}

// ── Count up ────────────────────────────────────────────────

export function useCountUp(
  target: number,
  options: { duration?: number; enabled?: boolean } = {},
) {
  const { duration = 1400, enabled = true } = options;
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    // Respect reduced-motion
    const reduce =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setValue(target);
      return;
    }

    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const t = Math.min(1, (now - startRef.current) / duration);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      startRef.current = null;
    };
  }, [target, duration, enabled]);

  return value;
}

// ── Mouse position ──────────────────────────────────────────

export function useMousePosition<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [pos, setPos] = useState({ x: 0, y: 0, active: false });
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Skip on touch devices
    if (!window.matchMedia("(hover: hover)").matches) return;

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      pendingRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const p = pendingRef.current;
          if (p) setPos({ x: p.x, y: p.y, active: true });
        });
      }
    };

    const onLeave = () => setPos((p) => ({ ...p, active: false }));

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { ref, pos };
}

// ── Scroll progress ─────────────────────────────────────────

export function useScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const doc = document.documentElement;
        const total = doc.scrollHeight - doc.clientHeight;
        setProgress(total > 0 ? Math.min(1, doc.scrollTop / total) : 0);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return progress;
}

// ── Typewriter ──────────────────────────────────────────────

export function useTypewriter(
  phrases: string[],
  options: { speed?: number; pauseMs?: number; enabled?: boolean } = {},
) {
  const { speed = 42, pauseMs = 1500, enabled = true } = options;
  const [text, setText] = useState("");
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setText(phrases[0] ?? "");
      return;
    }

    const current = phrases[phraseIndex % phrases.length];

    // Finished typing → pause, then start deleting
    if (!isDeleting && text === current) {
      const t = window.setTimeout(() => setIsDeleting(true), pauseMs);
      return () => window.clearTimeout(t);
    }

    // Finished deleting → advance to next phrase
    if (isDeleting && text === "") {
      setIsDeleting(false);
      setPhraseIndex((i) => (i + 1) % phrases.length);
      return;
    }

    const t = window.setTimeout(
      () => {
        setText((prev) =>
          isDeleting
            ? prev.slice(0, -1)
            : current.slice(0, prev.length + 1),
        );
      },
      isDeleting ? speed / 2 : speed,
    );
    return () => window.clearTimeout(t);
  }, [text, isDeleting, phraseIndex, phrases, speed, pauseMs, enabled]);

  return text;
}