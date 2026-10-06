import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { suggestionsApi } from "@/features/suggestions/api";
import { TemplateSuggestions } from "@/features/templates/components/TemplateSuggestions";
import { PinnedRuns } from "@/features/home/components/PinnedRuns";

const WORDS = ["Ask", "Analyze", "Explain", "Visualize"] as const;

const STATS: Array<[string, string, string]> = [
  ["< 60s", "time to first answer", "#22D3EE"],
  ["100%", "answers expose SQL", "#8B5CF6"],
  ["Read-only", "no writes possible", "#34D399"],
  ["Local", "SQLite + DuckDB", "#FBBF24"],
];

export function HomePage() {
  const nav = useNavigate();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = window.setInterval(
      () => setIdx((i) => (i + 1) % WORDS.length),
      2100,
    );
    return () => window.clearInterval(t);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["suggestions"],
    queryFn: () => suggestionsApi.list(undefined, 6),
    staleTime: 60_000,
  });

  const suggestions = data?.suggestions ?? [];
  const source = data?.source;

  const ask = (q: string) => nav(`/workspace?q=${encodeURIComponent(q)}`);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[880px] mx-auto px-6 pt-16 pb-12">
        {/* ── Hero ─────────────────────────────── */}
        <div data-tour="hero" className="text-center mb-10">
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
            Local · read-only · provider-agnostic
          </div>

          <h1
            className="font-mono font-bold tracking-tight leading-[1.1] mb-5"
            style={{ fontSize: "clamp(30px, 4.4vw, 50px)" }}
          >
            <span
              key={idx}
              className="word-in"
              style={{
                background: "linear-gradient(135deg,#22D3EE,#8B5CF6)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {WORDS[idx]}
            </span>
            <br />
            your data.
            <br />
            <span style={{ opacity: 0.9 }}>Get the answer. See the proof.</span>
          </h1>

          <p className="text-muted text-[14.5px] max-w-[580px] mx-auto leading-relaxed">
            Upload a CSV. Ask in plain English. Get SQL, Python, charts and a
            full execution trace — never an opaque answer.
          </p>
        </div>

        {/* ── Stats ────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
          {STATS.map(([value, label, color]) => (
            <div key={label} className="glass rounded-xl p-3.5 text-center">
              <div
                className="font-mono text-[17px] font-bold"
                style={{ color }}
              >
                {value}
              </div>
              <div className="text-[11px] text-muted mt-1 leading-tight">
                {label}
              </div>
            </div>
          ))}
        </div>
        
        {/* ── Pinned analyses (only if any) ────── */}
        <PinnedRuns />

        {/* ── Templates (only if user has used any) ── */}
        <TemplateSuggestions />

        {/* ── Suggestions ──────────────────────── */}
        <div className="flex items-center justify-between mb-3">
          <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted/70">
            Try a question
          </div>
          {source === "datasets" && (
            <div className="font-mono text-[10px] text-muted/60">
              tailored to your data
            </div>
          )}
          {source === "default" && !isLoading && (
            <div className="font-mono text-[10px] text-muted/60">
              upload a dataset to customize
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="grid sm:grid-cols-2 gap-2.5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="shimmer rounded-xl h-[62px]"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : (
          <div data-tour="suggestions" className="grid sm:grid-cols-2 gap-2.5">
            {suggestions.map((s) => (
              <button
                key={s.question}
                type="button"
                onClick={() => ask(s.question)}
                className="glass rounded-xl p-3.5 text-left cursor-pointer transition-colors hover:brightness-110 focusable"
              >
                <div className="flex items-start gap-2.5">
                  <ArrowRight
                    size={14}
                    className="text-cyan flex-none mt-0.5"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <span className="text-[13px] leading-snug block">
                      {s.question}
                    </span>
                    {(s.dataset || s.reason) && s.reason !== "default" && (
                      <span className="font-mono text-[10px] text-muted/70 mt-1 block truncate">
                        {s.dataset ? `on ${s.dataset}` : s.reason}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}