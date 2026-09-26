import { ArrowRight, BarChart3, Shield, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

const FEATURES = [
  {
    icon: Shield,
    title: "Read-only by design",
    description:
      "Every query runs against an isolated DuckDB engine. No writes, no risk.",
  },
  {
    icon: BarChart3,
    title: "Evidence-backed answers",
    description:
      "See the SQL, the Python, the chart, and the full reasoning behind every result.",
  },
  {
    icon: Zap,
    title: "Live execution trace",
    description:
      "Watch each agent step in real time, from planning to visualization.",
  },
];

export function LandingHero() {
  const nav = useNavigate();

  return (
    <section className="pt-20 pb-16 px-6">
      <div className="max-w-[900px] mx-auto text-center">
        {/* Badge */}
        <div
          className="chip mx-auto mb-6"
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

        {/* Headline */}
        <h1
          className="font-mono font-bold tracking-tight leading-[1.05] mb-6"
          style={{ fontSize: "clamp(36px, 5.5vw, 64px)" }}
        >
          <span
            style={{
              background: "linear-gradient(135deg,#22D3EE,#8B5CF6)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Ask your data.
          </span>
          <br />
          Get the answer. See the proof.
        </h1>

        {/* Subheadline */}
        <p className="text-muted text-[16px] max-w-[620px] mx-auto leading-relaxed mb-10">
          A glass-box AI analyst that turns plain English into SQL, Python,
          charts, and a full execution trace — never an opaque answer.
        </p>

        {/* CTA */}
        <div className="flex items-center justify-center gap-3 flex-wrap mb-16">
          <button
            type="button"
            onClick={() => nav("/workspace")}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-[12px] text-[14px] font-semibold cursor-pointer focusable"
            style={{
              background: "linear-gradient(180deg,#22D3EE,#0EA5C4)",
              color: "#04121A",
              boxShadow: "0 0 40px -8px rgba(34,211,238,.55)",
            }}
          >
            Start analyzing
            <ArrowRight size={14} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={() => nav("/sources")}
            className="btn-chip focusable cursor-pointer !px-6 !py-3 !text-[14px]"
          >
            Upload data
          </button>
        </div>

        {/* Feature cards */}
        <div className="grid sm:grid-cols-3 gap-4 text-left">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass rounded-2xl p-5">
              <div
                className="w-9 h-9 rounded-xl grid place-items-center mb-3"
                style={{
                  background: "rgba(34,211,238,.12)",
                  border: "1px solid rgba(34,211,238,.25)",
                }}
              >
                <f.icon size={16} className="text-cyan" strokeWidth={2} />
              </div>
              <div className="text-[13.5px] font-medium mb-1.5">
                {f.title}
              </div>
              <div className="text-[12.5px] text-muted leading-relaxed">
                {f.description}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}