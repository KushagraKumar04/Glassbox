import {
  ChevronDown,
  Download,
  ImageDown,
  MousePointerClick,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ChartSpec } from "@/features/chat/types";
import {
  exportCSV,
  exportSVGAsPNG,
  safeFilename,
} from "@/shared/utils/export";

import { DrilldownModal } from "./DrilldownModal";

const AXIS = {
  stroke: "#64748B",
  fontSize: 11,
  fontFamily: "JetBrains Mono",
} as const;

const GRID = "rgba(148,163,184,.10)";

const TOOLTIP = {
  background: "#0B1020",
  border: "1px solid rgba(148,163,184,.22)",
  borderRadius: 12,
  fontFamily: "JetBrains Mono",
  fontSize: 12,
  color: "#E8EEF8",
  padding: "8px 12px",
  boxShadow: "0 20px 50px -12px rgba(0,0,0,.7)",
} as const;

const COLORS = ["#22D3EE", "#8B5CF6", "#34D399", "#FBBF24"];

type ChartType = ChartSpec["type"];

const ALL_TYPES: ChartType[] = ["bar", "line", "area", "scatter", "table"];

const TYPE_LABELS: Record<ChartType, string> = {
  bar: "Bar chart",
  line: "Line chart",
  area: "Area chart",
  scatter: "Scatter plot",
  table: "Data table",
};

interface Props {
  spec: ChartSpec;
  filenameHint?: string;
  /** The SQL that produced this chart. Required for drill-down. */
  sql?: string;
  datasetIds?: string[];
  sourceIds?: string[];
}

interface DrillTarget {
  column: string;
  value: unknown;
}

export function ChartRenderer({
  spec,
  filenameHint,
  sql,
  datasetIds = [],
  sourceIds = [],
}: Props) {
  const { data, xKey, yKeys, title, unit, columns } = spec;

  const [showTable, setShowTable] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);
  const [drillTarget, setDrillTarget] = useState<DrillTarget | null>(null);
  const [override, setOverride] = useState<ChartType | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset the override whenever the underlying spec changes (new run)
  useEffect(() => {
    setOverride(null);
  }, [spec.type, spec.xKey, spec.yKeys.join(","), spec.title]);

  // Which chart types can we render with this spec?
  const available = computeAvailableTypes(spec);

  // The type actually being rendered
  const effectiveType: ChartType = (() => {
    if (override && available.has(override)) return override;
    if (available.has(spec.type)) return spec.type;
    // The spec's preferred type isn't renderable — fall back
    return available.has("bar") ? "bar" : "table";
  })();

  if (!data || data.length === 0) {
    return (
      <div className="glass rounded-2xl p-5">
        <div className="text-[14px] font-medium">{title || "Result"}</div>
        <div className="text-[12.5px] text-muted mt-2">
          No rows to visualize.
        </div>
      </div>
    );
  }

  const allColumns = columns ?? Object.keys(data[0] ?? {});
  const fileStem = filenameHint || title || "chart";

  // Drill-down only makes sense when we can filter by an x-value
  const canDrill =
    !!sql && !!xKey && effectiveType !== "table" && available.size > 1;

  const handleExportCSV = () => {
    exportCSV(data, safeFilename(fileStem, "csv"), allColumns);
  };

  const handleExportPNG = async () => {
    const svg = containerRef.current?.querySelector("svg");
    if (!svg) return;
    setExportingPng(true);
    try {
      await exportSVGAsPNG(svg, safeFilename(fileStem, "png"));
    } catch (e) {
      console.error("PNG export failed:", e);
      alert("PNG export failed. See console for details.");
    } finally {
      setExportingPng(false);
    }
  };

  const onPointClick = (payload: Record<string, unknown> | undefined) => {
    if (!canDrill || !payload) return;
    const value = payload[xKey];
    if (value === undefined || value === null) return;
    setDrillTarget({ column: xKey, value });
  };

  const isOverridden = override !== null && override !== spec.type;

  return (
    <div className="glass rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-1 gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[14px] font-medium">{title}</div>
          {unit && (
            <div className="font-mono text-[10.5px] text-muted mt-1">
              unit: {unit}
            </div>
          )}
        </div>

        <div className="flex gap-1.5 flex-wrap">
          <ChartTypePicker
            current={effectiveType}
            agentChoice={spec.type}
            available={available}
            isOverridden={isOverridden}
            onChange={setOverride}
            onReset={() => setOverride(null)}
          />

          {canDrill && (
            <span
              className="chip"
              style={{
                borderColor: "rgba(34,211,238,.3)",
                color: "#22D3EE",
              }}
              title="Click a bar / point / dot to see the underlying rows"
            >
              <MousePointerClick size={10} strokeWidth={2} />
              click to drill
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="chip cursor-pointer hover:brightness-125 focusable"
          >
            {showTable ? "hide table" : "data table"}
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="chip cursor-pointer hover:brightness-125 focusable"
            title="Download data as CSV"
          >
            <Download size={10} strokeWidth={2} />
            CSV
          </button>

          {effectiveType !== "table" && (
            <button
              type="button"
              onClick={() => void handleExportPNG()}
              disabled={exportingPng}
              className="chip cursor-pointer hover:brightness-125 focusable disabled:opacity-50"
              title="Download chart as PNG"
            >
              <ImageDown size={10} strokeWidth={2} />
              {exportingPng ? "exporting…" : "PNG"}
            </button>
          )}
        </div>
      </div>

      {/* Chart body */}
      {effectiveType !== "table" && (
        <div
          ref={containerRef}
          className={canDrill ? "mt-4 cursor-pointer" : "mt-4"}
          style={{ width: "100%", height: 300 }}
        >
          <ResponsiveContainer>
            {renderChart(
              effectiveType,
              data,
              xKey,
              yKeys,
              canDrill,
              onPointClick,
            )}
          </ResponsiveContainer>
        </div>
      )}

      {/* Data table fallback */}
      {(showTable || effectiveType === "table") && (
        <div
          className={effectiveType === "table" ? "mt-3" : "mt-5 pt-5 border-t"}
          style={{ borderColor: "var(--aida-border)" }}
        >
          <div className="overflow-x-auto max-h-[360px]">
            <table className="w-full font-mono text-[11.5px]">
              <thead
                className="sticky top-0"
                style={{ background: "var(--aida-code-bg-solid)" }}
              >
                <tr className="text-left text-muted/70">
                  {allColumns.map((c) => (
                    <th
                      key={c}
                      className="pb-2 pr-4 font-medium whitespace-nowrap"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 100).map((row, i) => (
                  <tr
                    key={i}
                    style={{ borderTop: "1px solid var(--aida-border)" }}
                  >
                    {allColumns.map((c) => (
                      <td
                        key={c}
                        className="py-1.5 pr-4 whitespace-nowrap text-txt/85"
                      >
                        {formatCell((row as Record<string, unknown>)[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {data.length > 100 && (
              <div className="text-[10.5px] text-muted mt-2 text-center">
                Showing 100 of {data.length.toLocaleString()} rows — export CSV
                for the full set
              </div>
            )}
          </div>
        </div>
      )}

      {/* Drill-down modal */}
      {drillTarget && sql && (
        <DrilldownModal
          open
          sql={sql}
          column={drillTarget.column}
          value={drillTarget.value}
          datasetIds={datasetIds}
          sourceIds={sourceIds}
          onClose={() => setDrillTarget(null)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Chart type picker
   ═══════════════════════════════════════════════════════════════ */

function ChartTypePicker({
  current,
  agentChoice,
  available,
  isOverridden,
  onChange,
  onReset,
}: {
  current: ChartType;
  agentChoice: ChartType;
  available: Set<ChartType>;
  isOverridden: boolean;
  onChange: (t: ChartType) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="chip cursor-pointer hover:brightness-125 focusable inline-flex items-center gap-1.5"
        style={
          isOverridden
            ? {
                borderColor: "rgba(251,191,36,.4)",
                color: "#FBBF24",
              }
            : undefined
        }
        title={
          isOverridden
            ? `Overridden (agent chose ${agentChoice}). Click to change.`
            : "Change chart type"
        }
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        chart: {current}
        {isOverridden && (
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: "#FBBF24" }}
            aria-hidden="true"
          />
        )}
        <ChevronDown size={9} strokeWidth={2.5} />
      </button>

      {open && (
        <div
          className="glass-strong rounded-xl absolute top-full right-0 mt-1.5 z-50 w-[200px] p-1.5 fade-up"
          style={{ boxShadow: "0 20px 50px -12px rgba(0,0,0,.8)" }}
          role="listbox"
        >
          <div className="px-2.5 py-1.5 font-mono text-[9.5px] uppercase tracking-wider text-muted/60">
            Chart type
          </div>

          {ALL_TYPES.map((t) => {
            const enabled = available.has(t);
            const isCurrent = t === current;
            const isAgentChoice = t === agentChoice && !isOverridden;
            return (
              <button
                key={t}
                type="button"
                disabled={!enabled}
                onClick={() => {
                  onChange(t);
                  setOpen(false);
                }}
                className={
                  "w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-[12.5px] transition-colors focusable " +
                  (enabled
                    ? "cursor-pointer hover:bg-white/5"
                    : "opacity-40 cursor-not-allowed") +
                  (isCurrent ? " text-cyan" : "")
                }
                role="option"
                aria-selected={isCurrent}
              >
                <span className="flex-1">{TYPE_LABELS[t]}</span>
                {isAgentChoice && (
                  <span className="font-mono text-[9.5px] text-muted/60">
                    agent
                  </span>
                )}
                {isCurrent && !isAgentChoice && (
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: "#22D3EE" }}
                  />
                )}
              </button>
            );
          })}

          {isOverridden && (
            <>
              <div
                className="my-1 border-t"
                style={{ borderColor: "var(--aida-border)" }}
              />
              <button
                type="button"
                onClick={() => {
                  onReset();
                  setOpen(false);
                }}
                className="w-full text-left px-2.5 py-2 rounded-lg text-[12px] text-muted hover:text-txt hover:bg-white/5 cursor-pointer transition-colors focusable"
              >
                Reset to agent choice
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Availability
   ═══════════════════════════════════════════════════════════════ */

function computeAvailableTypes(spec: ChartSpec): Set<ChartType> {
  const out = new Set<ChartType>();

  const hasData = Array.isArray(spec.data) && spec.data.length > 0;
  const hasYKeys = Array.isArray(spec.yKeys) && spec.yKeys.length > 0;
  const hasXKey = typeof spec.xKey === "string" && spec.xKey.length > 0;

  // Table always works
  out.add("table");

  if (!hasData) return out;

  // Bar / line / area / scatter all need an x-axis and at least one y
  if (hasXKey && hasYKeys) {
    out.add("bar");
    out.add("line");
    out.add("area");
    out.add("scatter");
  }

  return out;
}

/* ═══════════════════════════════════════════════════════════════
   Chart switch
   ═══════════════════════════════════════════════════════════════ */

/**
 * Recharts passes different shapes to onClick depending on the chart
 * type. Some pass the data object directly, some wrap it in `payload`,
 * some pass `(data, index, event)`. This normalizes all of them.
 */
function extractPayload(
  data: unknown,
): Record<string, unknown> | undefined {
  if (!data || typeof data !== "object") return undefined;
  const d = data as Record<string, unknown>;

  // Bar/Area wrap the row in `payload`
  if (d.payload && typeof d.payload === "object") {
    return d.payload as Record<string, unknown>;
  }
  // Line/Scatter pass the row directly (with extra fields)
  return d;
}

function renderChart(
  type: ChartType,
  data: Record<string, unknown>[],
  xKey: string,
  yKeys: string[],
  canDrill: boolean,
  onPointClick: (payload: Record<string, unknown> | undefined) => void,
) {
  // Shared click handler for every chart type.
  // When drill-down is off, we pass no props at all — Recharts uses defaults.
  const clickProps = canDrill
    ? {
        onClick: (d: unknown) => {
          const payload = extractPayload(d);
          if (payload) onPointClick(payload);
        },
        cursor: "pointer" as const,
      }
    : {};

  switch (type) {
    case "line":
      return (
        <LineChart data={data}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP} />
          <Legend
            wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: 11 }}
          />
          {yKeys.map((k, i) => (
            <Line
              key={k}
              type="monotone"
              dataKey={k}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={{
                r: 4,
                fill: "#0B1020",
                strokeWidth: 2,
                cursor: canDrill ? "pointer" : "default",
              }}
              activeDot={{ r: 6 }}
              {...clickProps}
            />
          ))}
        </LineChart>
      );

    case "area":
      return (
        <AreaChart data={data}>
          <defs>
            {yKeys.map((k, i) => (
              <linearGradient
                key={k}
                id={`area-${k}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={COLORS[i % COLORS.length]}
                  stopOpacity={0.3}
                />
                <stop
                  offset="100%"
                  stopColor={COLORS[i % COLORS.length]}
                  stopOpacity={0}
                />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP} />
          <Legend
            wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: 11 }}
          />
          {yKeys.map((k, i) => (
            <Area
              key={k}
              type="monotone"
              dataKey={k}
              stroke={COLORS[i % COLORS.length]}
              fill={`url(#area-${k})`}
              strokeWidth={2}
              {...clickProps}
            />
          ))}
        </AreaChart>
      );

    case "scatter":
      return (
        <ScatterChart>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis
            dataKey={yKeys[0]}
            tick={AXIS}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={TOOLTIP}
            cursor={{ strokeDasharray: "3 3" }}
          />
          <Scatter data={data} fill={COLORS[0]} {...clickProps} />
        </ScatterChart>
      );

    case "bar":
    default:
      return (
        <BarChart data={data}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={TOOLTIP}
            cursor={{ fill: "rgba(148,163,184,.06)" }}
          />
          <Legend
            wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: 11 }}
          />
          {yKeys.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              fill={COLORS[i % COLORS.length]}
              radius={[6, 6, 0, 0]}
              cursor={canDrill ? "pointer" : "default"}
              {...clickProps}
            />
          ))}
        </BarChart>
      );
  }
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