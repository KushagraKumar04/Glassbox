import { useQuery } from "@tanstack/react-query";
import { BarChart3, Loader2, X } from "lucide-react";
import { useEffect } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { columnApi, type ColumnStats } from "../column-api";

interface Props {
  open: boolean;
  datasetId: string;
  datasetName: string;
  column: string | null;
  onClose: () => void;
}

const AXIS = {
  stroke: "#64748B",
  fontSize: 10,
  fontFamily: "JetBrains Mono",
} as const;

const TOOLTIP_STYLE = {
  background: "#0B1020",
  border: "1px solid rgba(148,163,184,.22)",
  borderRadius: 12,
  fontFamily: "JetBrains Mono",
  fontSize: 11,
  color: "#E8EEF8",
  padding: "6px 10px",
} as const;

export function ColumnModal({
  open,
  datasetId,
  datasetName,
  column,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const { data, isLoading, isError, error } = useQuery<ColumnStats>({
    queryKey: ["column-stats", datasetId, column],
    queryFn: () => columnApi.stats(datasetId, column!),
    enabled: open && !!datasetId && !!column,
    staleTime: 5 * 60_000,
    retry: 0,
  });

  if (!open || !column) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-start justify-center pt-[8vh] px-4"
      style={{ background: "rgba(3,7,18,.72)", backdropFilter: "blur(6px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="glass-strong rounded-2xl w-[720px] max-w-full overflow-hidden fade-up flex flex-col"
        style={{
          boxShadow: "0 30px 90px -12px rgba(0,0,0,.9)",
          maxHeight: "84vh",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3.5 border-b flex-none"
          style={{ borderColor: "var(--aida-border)" }}
        >
          <BarChart3 size={15} className="text-cyan flex-none" strokeWidth={2} />
          <div className="min-w-0">
            <div className="font-mono text-[13px] font-semibold truncate">
              {column}
            </div>
            <div className="font-mono text-[10.5px] text-muted truncate">
              {datasetName} · {datasetId.slice(0, 8)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-muted hover:text-txt cursor-pointer focusable p-1"
            aria-label="Close"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading && (
            <div className="py-16 text-center">
              <Loader2 size={22} className="text-cyan animate-spin mx-auto" />
              <div className="font-mono text-[11.5px] text-muted mt-3">
                Analyzing column…
              </div>
            </div>
          )}

          {isError && (
            <div
              className="rounded-xl p-4 text-[12.5px]"
              style={{
                background: "rgba(248,113,113,.08)",
                border: "1px solid rgba(248,113,113,.3)",
                color: "#F87171",
              }}
            >
              {(error as Error)?.message ?? "Failed to load column stats"}
            </div>
          )}

          {data && <ColumnBody stats={data} />}
        </div>
      </div>
    </div>
  );
}

/* ── Body ────────────────────────────────────────────────── */

function ColumnBody({ stats }: { stats: ColumnStats }) {
  return (
    <div className="space-y-5">
      {/* Meta strip */}
      <div className="flex flex-wrap gap-2">
        <Chip label="type" value={stats.kind} accent="#22D3EE" />
        <Chip label="dtype" value={stats.dtype} />
        <Chip
          label="rows"
          value={stats.row_count.toLocaleString()}
        />
        <Chip
          label="distinct"
          value={stats.distinct_count.toLocaleString()}
        />
        <Chip
          label="nulls"
          value={`${(stats.null_rate * 100).toFixed(1)}%`}
          accent={stats.null_rate > 0.1 ? "#FBBF24" : undefined}
        />
      </div>

      {/* Numeric stats grid */}
      {stats.kind === "numeric" && stats.mean !== null && (
        <div className="grid grid-cols-3 gap-2.5">
          <StatBox label="min" value={fmt(stats.minimum)} />
          <StatBox label="p25" value={fmt(stats.p25)} />
          <StatBox label="median" value={fmt(stats.median)} />
          <StatBox label="mean" value={fmt(stats.mean)} accent="#22D3EE" />
          <StatBox label="p75" value={fmt(stats.p75)} />
          <StatBox label="max" value={fmt(stats.maximum)} />
          <StatBox label="std dev" value={fmt(stats.std)} span={3} />
        </div>
      )}

      {/* Date range */}
      {stats.kind === "date" && (stats.date_min || stats.date_max) && (
        <div className="grid grid-cols-2 gap-2.5">
          <StatBox label="earliest" value={stats.date_min ?? "—"} />
          <StatBox label="latest" value={stats.date_max ?? "—"} />
        </div>
      )}

      {/* Histogram */}
      {stats.histogram.length > 0 && (
        <div>
          <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted/70 mb-2">
            {stats.kind === "date" ? "Distribution by month" : "Distribution"}
          </div>
          <div
            className="rounded-xl p-3"
            style={{
              background: "var(--aida-code-bg)",
              border: "1px solid var(--aida-border)",
            }}
          >
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer>
                <BarChart data={stats.histogram}>
                  <CartesianGrid
                    stroke="rgba(148,163,184,.10)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={AXIS}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                    angle={stats.histogram.length > 12 ? -35 : 0}
                    textAnchor={
                      stats.histogram.length > 12 ? "end" : "middle"
                    }
                    height={stats.histogram.length > 12 ? 50 : 30}
                  />
                  <YAxis tick={AXIS} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    cursor={{ fill: "rgba(148,163,184,.06)" }}
                    formatter={(v: number) => [v.toLocaleString(), "rows"]}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {stats.histogram.map((_, i) => (
                      <Cell key={i} fill="#22D3EE" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Top values table */}
      {stats.top_values.length > 0 && (
        <div>
          <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted/70 mb-2">
            Top values
          </div>
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: "var(--aida-code-bg)",
              border: "1px solid var(--aida-border)",
            }}
          >
            <div className="max-h-[280px] overflow-y-auto">
              <table className="w-full font-mono text-[11.5px]">
                <thead
                  className="sticky top-0"
                  style={{ background: "var(--aida-code-bg-solid)" }}
                >
                  <tr className="text-left text-muted/70">
                    <th className="py-2 px-3 font-medium">value</th>
                    <th className="py-2 px-3 font-medium text-right">count</th>
                    <th className="py-2 px-3 font-medium text-right w-[60px]">
                      pct
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.top_values.map((v, i) => (
                    <tr
                      key={i}
                      style={{ borderTop: "1px solid var(--aida-border)" }}
                    >
                      <td className="py-1.5 px-3 text-txt/85 truncate max-w-[400px]">
                        {v.value}
                      </td>
                      <td className="py-1.5 px-3 text-right text-txt/85">
                        {v.count.toLocaleString()}
                      </td>
                      <td
                        className="py-1.5 px-3 text-right"
                        style={{ color: "#22D3EE" }}
                      >
                        {v.pct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sample values */}
      {stats.sample.length > 0 && stats.top_values.length === 0 && (
        <div>
          <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted/70 mb-2">
            Sample values
          </div>
          <div className="flex flex-wrap gap-1">
            {stats.sample.map((v, i) => (
              <span
                key={i}
                className="font-mono text-[11px] px-2 py-0.5 rounded"
                style={{
                  background: "var(--aida-code-bg)",
                  border: "1px solid var(--aida-border)",
                  color: "var(--aida-muted)",
                }}
              >
                {String(v)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Footer meta */}
      <div className="font-mono text-[10.5px] text-muted/60 text-center pt-1">
        {stats.elapsed_ms}ms
      </div>
    </div>
  );
}

/* ── Primitives ──────────────────────────────────────────── */

function Chip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[10.5px] px-2 py-1 rounded-md"
      style={{
        background: "var(--aida-code-bg)",
        border: "1px solid var(--aida-border)",
      }}
    >
      <span className="text-muted/60">{label}</span>
      <span style={{ color: accent ?? "var(--aida-txt)" }}>{value}</span>
    </span>
  );
}

function StatBox({
  label,
  value,
  accent,
  span,
}: {
  label: string;
  value: string;
  accent?: string;
  span?: number;
}) {
  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: "var(--aida-code-bg)",
        border: "1px solid var(--aida-border)",
        gridColumn: span ? `span ${span}` : undefined,
      }}
    >
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted/70 mb-1">
        {label}
      </div>
      <div
        className="font-mono text-[14px] font-semibold truncate"
        style={{ color: accent ?? "var(--aida-txt)" }}
      >
        {value}
      </div>
    </div>
  );
}

function fmt(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  if (Number.isInteger(v)) return v.toLocaleString();
  return v.toLocaleString(undefined, { maximumFractionDigits: 3 });
}