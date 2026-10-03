/**
 * Live answer card — rendered while the narrative streams in.
 *
 * The raw buffer arrives as plain text in the form:
 *
 *     <summary>
 *
 *     FINDINGS:
 *     - bullet
 *     - bullet
 *
 *     CAVEATS:
 *     - caveat
 *
 * This component does a lightweight incremental parse so the user sees
 * the summary write itself, then the findings appear as they arrive.
 *
 * When the run finishes, the real `answer` artifact replaces this card.
 */
import { Sparkles } from "lucide-react";

import { findArtifact } from "../types";
import type { Artifact } from "../types";

interface Props {
  text: string;
  artifacts: Artifact[];
}

export function StreamingAnswerCard({ text, artifacts }: Props) {
  // If the final structured answer already landed, don't show the live one.
  const finalAnswer = findArtifact(artifacts, "answer");
  if (finalAnswer) return null;
  if (!text) return null;

  const parsed = parseStreamed(text);

  return (
    <div
      className="glass rounded-2xl p-5 fade-up"
      style={{ borderColor: "rgba(34,211,238,.2)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-cyan" strokeWidth={2} />
        <span
          className="font-mono text-[10.5px] uppercase tracking-wider"
          style={{ color: "#22D3EE" }}
        >
          Answer
        </span>
        <span className="ml-auto flex items-center gap-2 font-mono text-[10.5px] text-muted">
          <span
            className="pulse-dot inline-block"
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: "#22D3EE",
            }}
          />
          writing…
        </span>
      </div>

      {parsed.summary && (
        <p className="text-[15px] leading-relaxed mb-3 whitespace-pre-wrap">
          {parsed.summary}
          {!parsed.findingsReady && <Caret />}
        </p>
      )}

      {parsed.findings.length > 0 && (
        <ul className="space-y-1.5 text-[13.5px]">
          {parsed.findings.map((f, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="text-muted font-mono text-[11px] mt-0.5">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      {parsed.caveats.length > 0 && (
        <div
          className="mt-4 pt-4 border-t text-[12.5px] text-muted"
          style={{ borderColor: "rgba(148,163,184,.16)" }}
        >
          <strong className="text-warn font-medium">Caveats: </strong>
          {parsed.caveats.join(" · ")}
        </div>
      )}
    </div>
  );
}

function Caret() {
  return (
    <span
      className="inline-block align-middle ml-0.5"
      style={{
        width: 8,
        height: 15,
        background: "#22D3EE",
        opacity: 0.7,
        animation: "blink 1s steps(2, start) infinite",
      }}
    />
  );
}

/* ── Incremental parser ─────────────────────────────────── */

function parseStreamed(text: string): {
  summary: string;
  findings: string[];
  caveats: string[];
  findingsReady: boolean;
} {
  const findingsMatch = text.match(/^\s*FINDINGS:\s*$/m);
  const caveatsMatch = text.match(/^\s*CAVEATS:\s*$/m);

  const summaryEnd =
    findingsMatch?.index ??
    caveatsMatch?.index ??
    text.length;

  const summary = text.slice(0, summaryEnd).trim();

  const findings: string[] = [];
  const caveats: string[] = [];

  const findingsStart = findingsMatch
    ? (findingsMatch.index ?? 0) + findingsMatch[0].length
    : null;
  const caveatsStart = caveatsMatch ? (caveatsMatch.index ?? 0) : null;

  if (findingsStart !== null) {
    const end = caveatsStart !== null ? caveatsStart : text.length;
    findings.push(...bullets(text.slice(findingsStart, end)));
  }

  if (caveatsStart !== null) {
    caveats.push(...bullets(text.slice(caveatsStart)));
  }

  return {
    summary,
    findings,
    caveats,
    findingsReady: findings.length > 0,
  };
}

function bullets(block: string): string[] {
  const out: string[] = [];
  for (const line of block.split("\n")) {
    const t = line.trim();
    if (t.startsWith("- ") || t.startsWith("• ")) {
      const item = t.slice(2).trim();
      if (item) out.push(item);
    }
  }
  return out;
}