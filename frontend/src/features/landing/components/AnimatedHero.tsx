// 
import { ArrowRight, Sparkles, Upload, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useTypewriter } from "../hooks";

const CYCLE_WORDS = ["Ask", "Analyze", "Explain", "Visualize"];

const TYPEWRITER_PHRASES = [
  "Which region grew fastest last quarter?",
  "Show me the top 10 products by margin.",
  "Why did revenue drop in June?",
  "Forecast next quarter's bookings.",
];

export function AnimatedHero() {
  const nav = useNavigate();

  const typed = useTypewriter(TYPEWRITER_PHRASES, {
    speed: 45,
    pauseMs: 1600,
  });

  // Cycle the big headline word
  const [wordIndex, setWordIndex] = useState(0);
  useEffect(() => {
    const t = window.setInterval(
      () => setWordIndex((i) => (i + 1) % CYCLE_WORDS.length),
      2400,
    );
    return () => window.clearInterval(t);
  }, []);

  return (
    <section className="relative overflow-hidden pt-24 pb-20 px-6">
      <div className="relative max-w-[900px] mx-auto text-center">
        {/* ── Floating cube with orbit rings ───────────────── */}
        <div className="relative w-[120px] h-[120px] mx-auto mb-12">
          <div className="hero-cube">
            <img
              src="/logo-mark.png"
              alt="Glassbox"
              width={88}
              height={88}
              className="w-[88px] h-[88px]"
              style={{
                // Small compensation for the sparkles on the top-right
                // of the PNG, so the CUBE itself sits at the true center.
                transform: "translate(-3px, 1px)",
                filter:
                  "drop-shadow(0 0 40px rgba(34,211,238,.55)) drop-shadow(0 0 80px rgba(139,92,246,.25))",
              }}
            />
          </div>
          <div className="hero-orbit" aria-hidden="true">
            <span className="hero-orbit-dot" />
          </div>
          <div className="hero-orbit hero-orbit-2" aria-hidden="true">
            <span className="hero-orbit-dot hero-orbit-dot-2" />
          </div>
        </div>

        {/* ── Badge ────────────────────────────────────────── */}
        <div
          className="chip mx-auto mb-8"
          style={{ borderColor: "rgba(34,211,238,.3)", color: "#22D3EE" }}
        >
          <span
            className="pulse-dot"
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: "#22D3EE",
              display: "inline-block",
            }}
          />
          v0.1 — Open source · MIT license
        </div>

        {/* ── Headline ─────────────────────────────────────── */}
        <h1
          className="font-mono font-bold tracking-tight leading-[1.02] mb-6"
          style={{ fontSize: "clamp(38px, 6vw, 72px)" }}
        >
          <span key={wordIndex} className="shimmer-text word-swap">
            {CYCLE_WORDS[wordIndex]}
          </span>
          <br />
          your data.
          <br />
          <span className="text-muted/90" style={{ fontWeight: 500 }}>
            Get the answer. See the proof.
          </span>
        </h1>

        {/* ── Typewriter ───────────────────────────────────── */}
        <div
          className="max-w-[640px] mx-auto mb-10 h-[56px] sm:h-[32px]"
          aria-live="polite"
        >
          <p className="text-[15px] leading-relaxed text-muted">
            Ask things like{" "}
            <span className="font-mono text-cyan">
              {typed}
              <span className="caret" />
            </span>
          </p>
        </div>

        {/* ── CTAs ─────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-3 flex-wrap mb-14">
          <button
            type="button"
            onClick={() => nav("/home")}
            className="btn-hero-primary group"
          >
            <Sparkles size={15} strokeWidth={2.4} />
            Start analyzing
            <ArrowRight
              size={14}
              strokeWidth={2.5}
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </button>
          <button
            type="button"
            onClick={() => nav("/sources")}
            className="btn-hero-secondary"
          >
            <Upload size={14} strokeWidth={2.2} />
            Upload data
          </button>
        </div>

        {/* ── Trust strip ──────────────────────────────────── */}
        <div className="flex items-center justify-center gap-6 flex-wrap text-muted/70">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px]">
            <Zap size={10} strokeWidth={2.5} className="text-cyan" />
            &lt; 60s to first answer
          </span>
          <span className="w-1 h-1 rounded-full bg-muted/40" />
          <span className="font-mono text-[10.5px]">
            Read-only · every run
          </span>
          <span className="w-1 h-1 rounded-full bg-muted/40" />
          <span className="font-mono text-[10.5px]">
            Full SQL &amp; Python trace
          </span>
        </div>
      </div>
    </section>
  );
}