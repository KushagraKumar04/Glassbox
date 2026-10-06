import { AlertTriangle, ArrowDown, ArrowUp, TrendingUp } from "lucide-react";

import type { Anomaly } from "@/features/chat/types";

interface Props {
  anomalies: Anomaly[];
  narrative?: string;
}

export function AnomalyCard({ anomalies, narrative }: Props) {
  if (!anomalies || anomalies.length === 0) return null;

  // Group by column for a compact display
  const byColumn = new Map<string, Anomaly[]>();
  for (const a of anomalies) {
    const list = byColumn.get(a.column) ?? [];
    list.push(a);
    byColumn.set(a.column, list);
  }

  return (
    <div
      className="glass rounded-2xl p-5 fade-up"
      style={{ borderColor: "rgba(251,191,36,.3)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <AlertTriangle
          size={14}
          className="text-warn flex-none"
          strokeWidth={2}
        />
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-warn">
          Anomalies
        </span>
        <span
          className="chip ml-auto"
          style={{
            borderColor: "rgba(251,191,36,.3)",
            color: "#FBBF24",
          }}
        >
          {anomalies.length} outlier{anomalies.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Narrative */}
      {narrative && (
        <p className="text-[13.5px] leading-relaxed mb-4">{narrative}</p>
      )}

      {/* By column */}
      <div className="space-y-3">
        {[...byColumn.entries()].map(([column, items]) => (
          <ColumnGroup key={column} column={column} items={items} />
        ))}
      </div>
    </div>
  );
}

/* ── Column group ──────────────────────────────────────── */

function ColumnGroup({
  column,
  items,
}: {
  column: string;
  items: Anomaly[];
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-[11.5px] text-txt/85">{column}</span>
        <span className="font-mono text-[10px] text-muted">
          {items.length} point{items.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-1.5">
        {items.slice(0, 4).map((a, i) => (
          <AnomalyRow key={i} anomaly={a} />
        ))}
        {items.length > 4 && (
          <div className="font-mono text-[10.5px] text-muted/70 pl-2">
            + {items.length - 4} more
          </div>
        )}
      </div>
    </div>
  );
}

/* ── One anomaly ───────────────────────────────────────── */

function AnomalyRow({ anomaly }: { anomaly: Anomaly }) {
  const isHigh = anomaly.direction === "high";

  return (
    <div
      className="rounded-lg px-3 py-2 flex items-center gap-3 flex-wrap"
      style={{
        background: "rgba(251,191,36,.05)",
        border: "1px solid rgba(251,191,36,.18)",
      }}
    >
      {/* Direction arrow */}
      <span
        className="w-6 h-6 rounded-md grid place-items-center flex-none"
        style={{
          background: isHigh
            ? "rgba(251,191,36,.15)"
            : "rgba(139,92,246,.15)",
          color: isHigh ? "#FBBF24" : "#8B5CF6",
        }}
        aria-hidden="true"
      >
        {isHigh ? (
          <ArrowUp size={12} strokeWidth={2.5} />
        ) : (
          <ArrowDown size={12} strokeWidth={2.5} />
        )}
      </span>

      {/* Value */}
      <span className="font-mono text-[13px] font-semibold text-txt">
        {formatNumber(anomaly.value)}
      </span>

      {/* vs mean */}
      <span className="font-mono text-[10.5px] text-muted">
        vs mean {formatNumber(anomaly.mean)}
      </span>

      {/* Z-score badge */}
      <span
        className="ml-auto inline-flex items-center gap-1 font-mono text-[10.5px] px-2 py-0.5 rounded"
        style={{
          background: "rgba(251,191,36,.12)",
          color: "#FBBF24",
          border: "1px solid rgba(251,191,36,.28)",
        }}
        title="Standard deviations from the mean"
      >
        <TrendingUp size={9} strokeWidth={2.5} />
        {anomaly.z_score > 0 ? "+" : ""}
        {anomaly.z_score.toFixed(1)}σ
      </span>

      {/* Row index */}
      <span className="font-mono text-[10px] text-muted/60">
        row {anomaly.row_index}
      </span>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────── */

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}