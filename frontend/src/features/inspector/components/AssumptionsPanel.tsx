import { ShieldAlert, Sparkles } from "lucide-react";

import type { Artifact, QualityArtifact, SqlArtifact } from "@/features/chat/types";
import { findArtifact } from "@/features/chat/types";

export function AssumptionsPanel({ artifacts }: { artifacts: Artifact[] }) {
  const sql = findArtifact(artifacts, "sql") as SqlArtifact | undefined;
  const quality = findArtifact(artifacts, "quality") as
    | QualityArtifact
    | undefined;

  const assumptions = sql?.assumptions ?? [];
  const warnings = quality?.content.warnings ?? [];
  const confidence = quality?.content.confidence;
  const verdict = quality?.content.verdict;

  const confidenceColor =
    confidence === "high"
      ? "#34D399"
      : confidence === "medium"
        ? "#FBBF24"
        : confidence === "low"
          ? "#F87171"
          : "#AAB6CC";

  return (
    <div className="space-y-5">
      {/* Assumptions */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={12} className="text-cyan" strokeWidth={2} />
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted">
            Assumptions
          </span>
        </div>

        {assumptions.length === 0 ? (
          <div className="text-[12.5px] text-muted leading-relaxed">
            No assumptions declared. The question resolved unambiguously.
          </div>
        ) : (
          <div className="space-y-2">
            {assumptions.map((a, i) => (
              <div key={i} className="glass rounded-xl p-3.5">
                <div className="flex items-start gap-2.5">
                  <span className="font-mono text-[10px] text-muted mt-0.5">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[12.5px] leading-relaxed">{a}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quality review */}
      {quality && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert
              size={12}
              className="text-warn"
              strokeWidth={2}
            />
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted">
              Quality review
            </span>
            {confidence && (
              <span
                className="ml-auto font-mono text-[10.5px]"
                style={{ color: confidenceColor }}
              >
                {confidence}
              </span>
            )}
          </div>

          {verdict && (
            <div className="text-[12.5px] text-muted leading-relaxed mb-3">
              {verdict}
            </div>
          )}

          {warnings.length > 0 ? (
            <div className="space-y-2">
              {warnings.map((w, i) => (
                <div
                  key={i}
                  className="rounded-xl p-3 text-[12px] leading-relaxed"
                  style={{
                    background: "rgba(251,191,36,.06)",
                    border: "1px solid rgba(251,191,36,.22)",
                    color: "#E8EEF8",
                  }}
                >
                  <span className="text-warn font-mono text-[10px] mr-2">
                    ⚠
                  </span>
                  {w}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[12.5px] text-muted">
              No quality warnings.
            </div>
          )}
        </div>
      )}

      {!quality && !sql && (
        <div className="text-[12.5px] text-muted leading-relaxed">
          Run an analysis to see assumptions and quality review here.
        </div>
      )}
    </div>
  );
}