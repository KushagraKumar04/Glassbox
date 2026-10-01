import { useNavigate } from "react-router-dom";

import { ThemeToggle } from "@/features/theme/ThemeToggle";

import { AnimatedHero } from "../components/AnimatedHero";
import { AuroraBackground } from "../components/AuroraBackground";
import { FAQ } from "../components/FAQ";
import { FinalCTA } from "../components/FinalCTA";
import { HowItWorks } from "../components/HowItWorks";
import { LiveDemo } from "../components/LiveDemo";
import { NewsSection } from "../components/NewsSection";
import { ScrollProgress } from "../components/ScrollProgress";
import { ScrollReveal } from "../components/ScrollReveal";
import { StatsStrip } from "../components/StatsStrip";
import { TechStack } from "../components/TechStack";
import { useMousePosition } from "../hooks";

export function LandingPage() {
  const nav = useNavigate();
  const { ref, pos } = useMousePosition<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className="h-screen w-screen overflow-y-auto overflow-x-hidden relative"
      style={{ background: "var(--aida-bg)" }}
    >
      <ScrollProgress />
      <AuroraBackground />

      {/* ── Global mouse spotlight — fixed, follows cursor everywhere ── */}
      <div
        className="fixed pointer-events-none transition-opacity duration-300 z-[2]"
        style={{
          left: pos.x,
          top: pos.y,
          width: 620,
          height: 620,
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(34,211,238,.14) 0%, rgba(139,92,246,.09) 40%, transparent 70%)",
          opacity: pos.active ? 1 : 0,
          filter: "blur(4px)",
        }}
        aria-hidden="true"
      />

      {/* ── Floating top row ─────────────────────────────── */}
      <div className="fixed top-0 left-0 right-0 z-50 px-6 py-5 flex items-center gap-3">
        <img
          src="/logo-mark.png"
          alt=""
          width={32}
          height={32}
          className="w-8 h-8 rounded-lg"
          aria-hidden="true"
        />
        <span className="font-mono text-[14px] font-semibold tracking-tight">
          Glassbox
        </span>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => nav("/login")}
            className="btn-chip focusable cursor-pointer"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => nav("/home")}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[10px] text-[12.5px] font-semibold cursor-pointer focusable"
            style={{
              background: "linear-gradient(180deg,#22D3EE,#0EA5C4)",
              color: "#04121A",
              boxShadow: "0 0 24px -6px rgba(34,211,238,.55)",
            }}
          >
            Get started
          </button>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────── */}
      <div className="relative z-[1] flex flex-col min-h-full">
        <main className="flex-1">
          <AnimatedHero />

          <StatsStrip />

          <HowItWorks />

          <LiveDemo />

          <TechStack />

          <ScrollReveal>
            <NewsSection />
          </ScrollReveal>

          <FAQ />

          <FinalCTA />
        </main>

        <footer
          className="px-6 py-6 border-t text-center font-mono text-[10.5px] text-muted/70"
          style={{ borderColor: "var(--aida-border)" }}
        >
          Glassbox · MIT license · Built with DuckDB, FastAPI, and React
        </footer>
      </div>
    </div>
  );
}