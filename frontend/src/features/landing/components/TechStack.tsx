import { ScrollReveal } from "./ScrollReveal";

const STACK = [
  { name: "DuckDB", what: "In-process OLAP", color: "#FBBF24" },
  { name: "FastAPI", what: "Async Python API", color: "#34D399" },
  { name: "React 19", what: "Modern UI runtime", color: "#22D3EE" },
  { name: "Monaco", what: "SQL / Python editor", color: "#8B5CF6" },
  { name: "Recharts", what: "SVG charts", color: "#F472B6" },
  { name: "SQLite", what: "Local metadata store", color: "#AAB6CC" },
];

export function TechStack() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-[980px] mx-auto">
        <ScrollReveal>
          <div className="text-center mb-12">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-cyan mb-3">
              Tech stack
            </div>
            <h2
              className="font-mono font-bold tracking-tight mb-4"
              style={{ fontSize: "clamp(22px, 3vw, 34px)" }}
            >
              Built on boring, reliable tools.
            </h2>
            <p className="text-muted text-[13.5px] max-w-[480px] mx-auto leading-relaxed">
              No exotic dependencies. No vendor lock-in. Everything runs
              locally and stays yours.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {STACK.map((s, i) => (
            <ScrollReveal key={s.name} delay={i * 60}>
              <div
                className="glass rounded-xl p-4 flex items-center gap-3 transition-transform hover:-translate-y-0.5"
              >
                <span
                  className="w-2 h-2 rounded-full flex-none"
                  style={{
                    background: s.color,
                    boxShadow: `0 0 12px ${s.color}`,
                  }}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className="font-mono text-[13px] font-semibold truncate">
                    {s.name}
                  </div>
                  <div className="text-[11px] text-muted truncate">
                    {s.what}
                  </div>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}