import { Database, MessageSquare, ScanSearch } from "lucide-react";

import { ScrollReveal } from "./ScrollReveal";

const STEPS = [
  {
    n: 1,
    icon: Database,
    title: "Connect",
    body:
      "Upload CSV, Excel, Parquet, or JSON. Or attach a Postgres, MySQL, or SQLite database. Everything stays on your machine.",
    tags: ["CSV", "Postgres", "MySQL", "SQLite", "Snowflake-ready"],
  },
  {
    n: 2,
    icon: MessageSquare,
    title: "Ask",
    body:
      "Type a question in plain English. The agent picks the columns, writes the SQL, runs the math, and picks the chart.",
    tags: ["NL → SQL", "NL → Python", "Follow-ups"],
  },
  {
    n: 3,
    icon: ScanSearch,
    title: "Inspect",
    body:
      "See every step — the query, the assumptions, the trace, the outliers. Nothing is a black box. Ever.",
    tags: ["SQL trace", "Assumptions", "DAX export"],
  },
];

export function HowItWorks() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-[1100px] mx-auto">
        <ScrollReveal>
          <div className="text-center mb-16">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-cyan mb-3">
              How it works
            </div>
            <h2
              className="font-mono font-bold tracking-tight mb-4"
              style={{ fontSize: "clamp(26px, 3.6vw, 42px)" }}
            >
              Three steps. No black boxes.
            </h2>
            <p className="text-muted text-[14px] max-w-[520px] mx-auto leading-relaxed">
              From raw file to evidence-backed answer in under a minute.
            </p>
          </div>
        </ScrollReveal>

        <div className="relative">
          {/* Horizontal connecting line (desktop only) */}
          <div
            className="hidden md:block absolute top-[44px] left-[16%] right-[16%] h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(34,211,238,.35) 20%, rgba(139,92,246,.35) 50%, rgba(34,211,238,.35) 80%, transparent 100%)",
            }}
            aria-hidden="true"
          />

          <div className="grid md:grid-cols-3 gap-8">
            {STEPS.map((s, i) => (
              <ScrollReveal key={s.n} delay={i * 120}>
                <StepCard step={s} />
              </ScrollReveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StepCard({ step }: { step: (typeof STEPS)[number] }) {
  const Icon = step.icon;
  return (
    <div className="relative">
      {/* Numbered node */}
      <div className="flex justify-center mb-6">
        <div
          className="relative w-[88px] h-[88px] rounded-2xl grid place-items-center"
          style={{
            background: "var(--aida-glass-strong)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(34,211,238,.28)",
            boxShadow:
              "0 20px 50px -20px rgba(34,211,238,.4), inset 0 1px 0 rgba(255,255,255,.06)",
          }}
        >
          <Icon size={30} className="text-cyan" strokeWidth={1.7} />
          <span
            className="absolute -top-2 -right-2 w-7 h-7 rounded-full grid place-items-center font-mono text-[11px] font-bold"
            style={{
              background: "linear-gradient(135deg,#22D3EE,#8B5CF6)",
              color: "#04121A",
              boxShadow: "0 0 16px -2px rgba(34,211,238,.7)",
            }}
          >
            {step.n}
          </span>
        </div>
      </div>

      <div className="text-center mb-3">
        <div className="font-mono text-[15px] font-semibold mb-2">
          {step.title}
        </div>
        <p className="text-[13px] text-muted leading-relaxed max-w-[300px] mx-auto">
          {step.body}
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-1.5 mt-4">
        {step.tags.map((t) => (
          <span
            key={t}
            className="font-mono text-[10px] px-2 py-0.5 rounded-full"
            style={{
              color: "var(--aida-muted)",
              border: "1px solid var(--aida-border)",
              background: "var(--aida-surface)",
            }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}