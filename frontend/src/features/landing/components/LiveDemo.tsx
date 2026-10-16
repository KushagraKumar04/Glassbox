import { BarChart3, Code2, FileCode2, Sigma, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { useScrollReveal } from "../hooks";
import { ScrollReveal } from "./ScrollReveal";

const TABS = [
  { id: "sql", label: "SQL", icon: Code2 },
  { id: "python", label: "Python", icon: FileCode2 },
  { id: "dax", label: "DAX", icon: Sigma },
  { id: "answer", label: "Answer", icon: Sparkles },
] as const;

type TabId = (typeof TABS)[number]["id"];

const DEMO_QUESTION = "Which region has the highest revenue?";

// NOTE: the Python snippet avoids `${...}` because `${` inside a JS
// template literal would be interpreted as interpolation.
const SNIPPETS: Record<TabId, { lang: string; code: string }> = {
  sql: {
    lang: "sql",
    code: `SELECT
  region,
  SUM(revenue) AS total
FROM sales
GROUP BY region
ORDER BY total DESC
LIMIT 100`,
  },
  python: {
    lang: "python",
    code: `import pandas as pd

df = pd.DataFrame(rows)
top = df.loc[df["total"].idxmax()]
region = top["region"]
revenue = top["total"]

print(f"Top region: {region}")
print(f"Revenue: {revenue:,.0f}")`,
  },
  dax: {
    lang: "dax",
    code: `Revenue by Region =
SUMMARIZECOLUMNS(
    Sales[region],
    "Total Revenue", SUM(Sales[revenue])
)`,
  },
  answer: {
    lang: "text",
    code: `North America leads with $4,381,000,
followed by EMEA at $2,614,000.
APAC grew fastest (+18.4% MoM).`,
  },
};

export function LiveDemo() {
  const [tab, setTab] = useState<TabId>("sql");
  const [typed, setTyped] = useState("");

  const { ref, revealed } = useScrollReveal<HTMLDivElement>();

  useEffect(() => {
    if (!revealed) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTyped(DEMO_QUESTION);
      return;
    }
    let i = 0;
    const t = window.setInterval(() => {
      i++;
      setTyped(DEMO_QUESTION.slice(0, i));
      if (i >= DEMO_QUESTION.length) window.clearInterval(t);
    }, 38);
    return () => window.clearInterval(t);
  }, [revealed]);

  const snippet = SNIPPETS[tab];

  return (
    <section className="py-24 px-6">
      <div className="max-w-[980px] mx-auto" ref={ref}>
        <ScrollReveal>
          <div className="text-center mb-14">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-cyan mb-3">
              What a run looks like
            </div>
            <h2
              className="font-mono font-bold tracking-tight mb-4"
              style={{ fontSize: "clamp(26px, 3.6vw, 42px)" }}
            >
              From question to proof.
            </h2>
            <p className="text-muted text-[14px] max-w-[520px] mx-auto leading-relaxed">
              Every answer ships with the code that produced it — SQL,
              Python, and Power BI DAX.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "var(--aida-glass-strong)",
              backdropFilter: "blur(24px)",
              border: "1px solid var(--aida-border-strong)",
              boxShadow:
                "0 40px 100px -20px rgba(0,0,0,.6), 0 0 0 1px rgba(34,211,238,.06) inset",
            }}
          >
            {/* Question bar */}
            <div
              className="flex items-center gap-3 px-5 py-3.5 border-b"
              style={{ borderColor: "var(--aida-border)" }}
            >
              <div
                className="w-6 h-6 rounded-md grid place-items-center font-mono text-[10px] font-bold flex-none"
                style={{
                  background: "linear-gradient(135deg,#8B5CF6,#22D3EE)",
                  color: "#04121A",
                }}
              >
                Q
              </div>
              <div className="font-mono text-[13px] text-txt truncate">
                {typed}
                {typed.length < DEMO_QUESTION.length && (
                  <span className="caret" />
                )}
              </div>
              <span
                className="chip ml-auto flex-none"
                style={{
                  borderColor: "rgba(52,211,153,.3)",
                  color: "#34D399",
                }}
              >
                read-only ✓
              </span>
            </div>

            {/* Tabs */}
            <div
              className="flex gap-1 px-3 py-2 border-b overflow-x-auto"
              style={{ borderColor: "var(--aida-border)" }}
            >
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[11.5px] cursor-pointer transition-colors focusable flex-none"
                    style={{
                      background: active
                        ? "rgba(34,211,238,.12)"
                        : "transparent",
                      color: active ? "#22D3EE" : "var(--aida-muted)",
                    }}
                  >
                    <Icon size={11} strokeWidth={2} />
                    {t.label}
                  </button>
                );
              })}
              <span className="ml-auto font-mono text-[10.5px] text-muted/60 self-center pr-2 hidden sm:block">
                {snippet.lang}
              </span>
            </div>

            {/* Code body */}
            <div className="p-5 relative">
              <pre
                className="font-mono text-[12.5px] leading-[1.75] whitespace-pre overflow-x-auto"
                style={{ color: "var(--aida-txt)" }}
              >
                {highlight(snippet.code, snippet.lang)}
              </pre>
            </div>

            {/* Result bar */}
            {(tab === "sql" || tab === "python") && (
              <div
                className="flex items-center gap-3 px-5 py-3 border-t font-mono text-[11px] flex-wrap"
                style={{
                  borderColor: "var(--aida-border)",
                  background: "rgba(34,211,238,.03)",
                }}
              >
                <BarChart3 size={11} className="text-cyan" strokeWidth={2} />
                <span className="text-ok">4 rows · 42ms</span>
                <span className="text-muted/60">·</span>
                <span className="text-muted">
                  chart: bar → click to drill
                </span>
              </div>
            )}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

/* ── Minimal highlighter ─────────────────────────────────── */

const KEYWORDS: Record<string, RegExp> = {
  sql: /\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|LIMIT|SUM|AS|DESC|ASC|JOIN|ON|WITH|OVER|PARTITION BY)\b/g,
  python: /\b(import|from|as|def|return|print|if|else|elif|for|in|with|lambda)\b/g,
  dax: /\b(SUMMARIZECOLUMNS|SUM|CALCULATE|DIVIDE|VAR|RETURN)\b/g,
  text: /(?!)/g,
};

function highlight(code: string, lang: string): React.ReactNode {
  const kw = KEYWORDS[lang] ?? KEYWORDS.text;
  const lines = code.split("\n");

  return lines.map((line, i) => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    const re = new RegExp(
      `(${kw.source})|("[^"]*"|'[^']*')|(\\b\\d+(?:\\.\\d+)?\\b)|(--.*$|#.*$|//.*$)`,
      "g",
    );

    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      if (m.index > lastIndex) parts.push(line.slice(lastIndex, m.index));
      if (m[1])
        parts.push(
          <span key={`${i}-k-${m.index}`} style={{ color: "#8B5CF6", fontWeight: 600 }}>
            {m[1]}
          </span>,
        );
      else if (m[2])
        parts.push(
          <span key={`${i}-s-${m.index}`} style={{ color: "#34D399" }}>
            {m[2]}
          </span>,
        );
      else if (m[3])
        parts.push(
          <span key={`${i}-n-${m.index}`} style={{ color: "#FBBF24" }}>
            {m[3]}
          </span>,
        );
      else if (m[4])
        parts.push(
          <span
            key={`${i}-c-${m.index}`}
            style={{ color: "var(--aida-muted)", fontStyle: "italic" }}
          >
            {m[4]}
          </span>,
        );
      lastIndex = re.lastIndex;
    }
    if (lastIndex < line.length) parts.push(line.slice(lastIndex));

    return (
      <span key={i}>
        {parts}
        {i < lines.length - 1 ? "\n" : ""}
      </span>
    );
  });
}