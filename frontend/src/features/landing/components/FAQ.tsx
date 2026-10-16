import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { cn } from "@/shared/utils/cn";

import { ScrollReveal } from "./ScrollReveal";

interface QA {
  q: string;
  a: string;
}

const QUESTIONS: QA[] = [
  {
    q: "Where does my data go?",
    a: "Nowhere. Everything runs on your machine — DuckDB reads your files in-process, SQLite stores app metadata locally, and the LLM provider only sees the schema and a small sample of rows you explicitly run. Credentials are encrypted at rest and never logged.",
  },
  {
    q: "Can the AI write to my database?",
    a: "No. The SQL layer rejects anything that isn't a SELECT or WITH statement. This is enforced at the DuckDB engine level, not by the prompt. Every query is wrapped in a read-only transaction with a row cap.",
  },
  {
    q: "Which LLM providers are supported?",
    a: "Gemini, OpenAI, Anthropic, Ollama, OpenRouter, Groq, Cerebras, or any OpenAI-compatible endpoint. Swap providers by editing four lines in .env — no code changes, no rebuild.",
  },
  {
    q: "What happens to my prompts and queries?",
    a: "They persist locally in SQLite so you can reopen, re-run, and inspect any analysis. You can wipe all runs and datasets from Settings → Danger zone at any time.",
  },
  {
    q: "Does it work offline?",
    a: "Almost. The pipeline needs one LLM call per stage. If you point it at a local Ollama instance, the entire app runs offline — no network calls, no rate limits, no data leaving your machine.",
  },
  {
    q: "Is this production-ready?",
    a: "It's a v0.1 you can self-host today. Multi-user auth, audit logging, rate limiting, password reset with SMTP, and Docker sandboxing are all in. If you're deploying for a team, add HTTPS and a reverse proxy in front of it.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="py-24 px-6">
      <div className="max-w-[820px] mx-auto">
        <ScrollReveal>
          <div className="text-center mb-14">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-cyan mb-3">
              FAQ
            </div>
            <h2
              className="font-mono font-bold tracking-tight"
              style={{ fontSize: "clamp(24px, 3.2vw, 38px)" }}
            >
              Questions we get a lot.
            </h2>
          </div>
        </ScrollReveal>

        <div className="space-y-2">
          {QUESTIONS.map((qa, i) => (
            <ScrollReveal key={i} delay={i * 40}>
              <div
                className="glass rounded-xl overflow-hidden"
                style={{
                  borderColor:
                    open === i
                      ? "rgba(34,211,238,.3)"
                      : "var(--aida-border)",
                  transition: "border-color .2s ease",
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpen((v) => (v === i ? null : i))}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left cursor-pointer focusable"
                  aria-expanded={open === i}
                >
                  <span className="text-[13.5px] font-medium flex-1">
                    {qa.q}
                  </span>
                  <ChevronDown
                    size={14}
                    strokeWidth={2}
                    className={cn(
                      "text-muted flex-none transition-transform duration-200",
                      open === i && "rotate-180 text-cyan",
                    )}
                  />
                </button>

                <div
                  className="grid transition-all duration-300"
                  style={{
                    gridTemplateRows: open === i ? "1fr" : "0fr",
                  }}
                >
                  <div style={{ overflow: "hidden", minHeight: 0 }}>
                    <div
                      className="px-5 pb-5 text-[13px] text-muted leading-relaxed border-t pt-4"
                      style={{ borderColor: "var(--aida-border)" }}
                    >
                      {qa.a}
                    </div>
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