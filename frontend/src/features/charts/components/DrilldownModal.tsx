import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Loader2,
  Table2,
  X,
} from "lucide-react";
import { useEffect } from "react";

import { drilldownApi, type DrilldownResponse } from "../api";
import { exportCSV, safeFilename } from "@/shared/utils/export";

interface Props {
  open: boolean;
  sql: string;
  column: string;
  value: unknown;
  datasetIds: string[];
  sourceIds: string[];
  onClose: () => void;
}

export function DrilldownModal({
  open,
  sql,
  column,
  value,
  datasetIds,
  sourceIds,
  onClose,
}: Props) {
  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const { data, isLoading, isError, error } = useQuery<DrilldownResponse>({
    queryKey: ["drilldown", sql, column, value, datasetIds, sourceIds],
    queryFn: () =>
      drilldownApi.run({
        sql,
        column,
        value,
        dataset_ids: datasetIds,
        source_ids: sourceIds,
      }),
    enabled: open && !!sql && value !== undefined && value !== null,
    staleTime: 5 * 60_000,
    retry: 0,
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center pt-[8vh] px-4"
      style={{ background: "rgba(3,7,18,.75)", backdropFilter: "blur(6px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="glass-strong rounded-2xl w-[1000px] max-w-full overflow-hidden fade-up flex flex-col"
        style={{
          boxShadow: "0 30px 90px -12px rgba(0,0,0,.9)",
          maxHeight: "84vh",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3.5 border-b flex-none flex-wrap"
          style={{ borderColor: "rgba(148,163,184,.16)" }}
        >
          <Table2 size={15} className="text-cyan flex-none" strokeWidth={2} />
          <div className="min-w-0">
            <div className="font-mono text-[13px] font-semibold">
              Drill-down
            </div>
            <div className="font-mono text-[11px] text-muted truncate">
              {column} ={" "}
              <span style={{ color: "#22D3EE" }}>
                {formatValue(value)}
              </span>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {data?.ok && data.rows.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  exportCSV(
                    data.rows,
                    safeFilename(`drilldown_${column}_${value}`, "csv"),
                    data.columns,
                  )
                }
                className="chip cursor-pointer hover:brightness-125 focusable"
                title="Download these rows as CSV"
              >
                <Download size={10} strokeWidth={2} />
                CSV
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-muted hover:text-txt cursor-pointer focusable p-1"
              aria-label="Close"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {isLoading && (
            <div className="p-16 text-center">
              <Loader2
                size={26}
                className="text-cyan animate-spin mx-auto mb-3"
              />
              <div className="font-mono text-[12px] text-muted">
                Fetching underlying rows…
              </div>
            </div>
          )}

          {isError && (
            <ErrorBlock message={(error as Error)?.message ?? "Unknown error"} />
          )}

          {data && !data.ok && <ErrorBlock message={data.error} />}

          {data?.ok && data.rows.length === 0 && (
            <div className="p-16 text-center text-muted">
              <div className="text-[13px]">
                No rows matched this chart point.
              </div>
              <div className="text-[11.5px] mt-1 text-muted/70">
                The chart may have been produced from an aggregate that doesn't
                have a matching detail row.
              </div>
            </div>
          )}

          {data?.ok && data.rows.length > 0 && (
            <>
              <div
                className="flex items-center gap-3 px-4 py-2 flex-none flex-wrap"
                style={{
                  borderBottom: "1px solid rgba(148,163,184,.12)",
                  background: "var(--aida-code-bg)",
                }}
              >
                <span className="font-mono text-[11px] text-ok">
                  {data.row_count.toLocaleString()} row
                  {data.row_count === 1 ? "" : "s"}
                </span>
                <span className="font-mono text-[10.5px] text-muted">
                  · {data.elapsed_ms}ms
                </span>
                {data.truncated && (
                  <span
                    className="chip ml-auto"
                    style={{
                      borderColor: "rgba(251,191,36,.3)",
                      color: "#FBBF24",
                    }}
                  >
                    <AlertTriangle size={9} strokeWidth={2.5} />
                    showing first {data.rows.length}
                  </span>
                )}
              </div>

              <div className="overflow-auto">
                <table className="w-full font-mono text-[11.5px]">
                  <thead
                    className="sticky top-0 z-10"
                    style={{ background: "#0B1020" }}
                  >
                    <tr className="text-left text-muted/70">
                      {data.columns.map((c) => (
                        <th
                          key={c}
                          className="py-2 px-3 font-medium whitespace-nowrap"
                          style={{
                            borderBottom:
                              "1px solid rgba(148,163,184,.2)",
                          }}
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, i) => (
                      <tr
                        key={i}
                        style={{
                          borderTop:
                            "1px solid rgba(148,163,184,.08)",
                        }}
                      >
                        {data.columns.map((c) => (
                          <td
                            key={c}
                            className="py-1.5 px-3 whitespace-nowrap text-txt/85"
                          >
                            {formatCell(row[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-3 px-5 py-2.5 border-t flex-none font-mono text-[10.5px] text-muted/70"
          style={{ borderColor: "rgba(148,163,184,.16)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 hover:text-txt cursor-pointer focusable"
          >
            <ArrowLeft size={10} strokeWidth={2} />
            Back to chart
          </button>
          <span className="ml-auto">
            Filtered read-only view · esc to close
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────── */

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="p-8 text-center">
      <AlertTriangle
        size={22}
        className="text-err mx-auto mb-3"
        strokeWidth={2}
      />
      <div className="text-[13px] text-err mb-2">
        Could not load drill-down
      </div>
      <div className="font-mono text-[11.5px] text-muted max-w-[560px] mx-auto leading-relaxed">
        {message}
      </div>
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    return Number.isInteger(v) ? v.toLocaleString() : String(v);
  }
  return String(v);
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return v.toLocaleString();
    return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}