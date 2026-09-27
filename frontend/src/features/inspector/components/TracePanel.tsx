import type { Artifact, TraceArtifact } from "@/features/chat/types";
import { findArtifact } from "@/features/chat/types";

export function TracePanel({ artifacts }: { artifacts: Artifact[] }) {
  const trace = findArtifact(artifacts, "trace") as TraceArtifact | undefined;

  if (!trace?.events?.length) {
    return (
      <div className="text-[12.5px] text-muted leading-relaxed">
        No execution trace yet. Every run emits one here.
      </div>
    );
  }

  return (
    <div>
      <div
        className="chip mb-3"
        style={{ borderColor: "rgba(34,211,238,.3)", color: "#22D3EE" }}
      >
        {trace.events.length} events
      </div>

      <div className="space-y-0">
        {trace.events.map((e, i) => (
          <div
            key={i}
            className="flex gap-3 py-2.5"
            style={{ borderBottom: "1px solid rgba(148,163,184,.16)" }}
          >
            <span className="font-mono text-[10px] text-muted/60 w-6 flex-none pt-0.5">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="font-mono text-[11.5px]"
                  style={{ color: "#8B5CF6" }}
                >
                  {e.stage}
                </span>
                <span
                  className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    background:
                      e.status === "done"
                        ? "rgba(52,211,153,.12)"
                        : e.status === "error"
                          ? "rgba(248,113,113,.12)"
                          : "rgba(34,211,238,.12)",
                    color:
                      e.status === "done"
                        ? "#34D399"
                        : e.status === "error"
                          ? "#F87171"
                          : "#22D3EE",
                  }}
                >
                  {e.status}
                </span>
                <span className="font-mono text-[10.5px] text-muted ml-auto">
                  {e.ts}ms
                </span>
              </div>
              {e.detail && (
                <div className="font-mono text-[10.5px] text-muted mt-1 truncate">
                  {e.detail}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div
        className="mt-4 glass rounded-xl p-3 text-[11.5px] text-muted leading-relaxed"
      >
        Every run persists inputs, code versions and result metadata.{" "}
        <span className="text-txt">100% reproducible.</span>
      </div>
    </div>
  );
}