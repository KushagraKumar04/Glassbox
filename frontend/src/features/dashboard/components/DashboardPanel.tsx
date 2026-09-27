import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  Hash,
  LineChart as LineChartIcon,
  Table2,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DashboardPanelData } from "../api";

const AXIS = {
  stroke: "#64748B",
  fontSize: 10,
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

interface Props {
  panel: DashboardPanelData;
}

export function DashboardPanel({ panel }: Props) {
  return (
    <div className="glass rounded-2xl p-4 flex flex-col min-h-[180px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium truncate">
            {panel.title}
          </div>
          {panel.subtitle && (
            <div className="font-mono text-[10px] text-muted truncate">
              {panel.subtitle}
            </div>
          )}
        </div>
        <KindIcon kind={panel.kind} />
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0">
        {panel.kind === "kpi" ? (
          <KpiBody panel={panel} />
        ) : panel.kind === "table" ? (
          <TableBody panel={panel} />
        ) : (
          <ChartBody panel={panel} />
        )}
      </div>

      {/* Footer — ask in workspace */}
      <div className="flex items-center justify-end mt-3 pt-3 border-t" style={{ borderColor: "rgba(148,163,184,.12)" }}>
        <Link
          to={`/workspace?q=${encodeURIComponent(askPromptFor(panel))}`}
          className="inline-flex items-center gap-1.5 font-mono text-[10.5px] text-muted hover:text-cyan transition-colors focusable"
        >
          ask about this
          <ArrowRight size={10} strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}

/* ── KPI body ─────────────────────────────────────────── */

function KpiBody({ panel }: { panel: DashboardPanelData }) {
  const formatted = formatValue(panel.value, panel.format, panel.unit);
  return (
    <div className="flex flex-col items-start justify-center py-2">
      <div
        className="font-mono text-[28px] font-bold leading-none"
        style={{ color: "#22D3EE", letterSpacing: "-0.02em" }}
      >
        {formatted.display}
      </div>
      {formatted.suffix && (
        <div className="font-mono text-[12px] text-muted/80 mt-1">
          {formatted.suffix}
        </div>
      )}
    </div>
  );
}

/* ── Chart body ───────────────────────────────────────── */

function ChartBody({ panel }: { panel: DashboardPanelData }) {
  const { spec, data } = panel;
  if (!data || data.length === 0) {
    return (
      <div className="grid place-items-center h-[120px] text-muted/60 text-[11.5px]">
        No data
      </div>
    );
  }

  const xKey = spec.xKey ?? "";
  const yKeys = spec.yKeys ?? [];
  const chartType = spec.type ?? "bar";

  return (
    <div style={{ width: "100%", height: 180 }}>
      <ResponsiveContainer>
        {chartType === "line" ? (
          <LineChart data={data}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey={xKey}
              tick={AXIS}
              axisLine={false}
              tickLine={false}
              tickFormatter={shortTick}
            />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP} />
            {yKeys.map((k) => (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                stroke="#22D3EE"
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        ) : (
          <BarChart data={data}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey={xKey}
              tick={AXIS}
              axisLine={false}
              tickLine={false}
              tickFormatter={shortTick}
            />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={TOOLTIP}
              cursor={{ fill: "rgba(148,163,184,.06)" }}
            />
            {yKeys.map((k) => (
              <Bar key={k} dataKey={k} fill="#22D3EE" radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/* ── Table body ───────────────────────────────────────── */

function TableBody({ panel }: { panel: DashboardPanelData }) {
  const rows = panel.data.slice(0, 5);
  if (rows.length === 0) {
    return (
      <div className="text-[11.5px] text-muted text-center py-6">
        No rows
      </div>
    );
  }
  const cols = Object.keys(rows[0]).slice(0, 5);

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full font-mono text-[10px]">
        <thead>
          <tr className="text-left text-muted/70">
            {cols.map((c) => (
              <th key={c} className="pb-1.5 pr-3 font-medium whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: "1px solid rgba(148,163,184,.08)" }}>
              {cols.map((c) => (
                <td
                  key={c}
                  className="py-1.5 pr-3 whitespace-nowrap text-txt/85 max-w-[140px] truncate"
                >
                  {String(r[c] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {panel.data.length > 5 && (
        <div className="text-[10px] text-muted/60 mt-2 text-center">
          showing 5 of {panel.data.length}
        </div>
      )}
    </div>
  );
}

/* ── Kind icon ────────────────────────────────────────── */

function KindIcon({ kind }: { kind: DashboardPanelData["kind"] }) {
  const common = { size: 11, strokeWidth: 2 } as const;
  const wrap = (children: React.ReactNode) => (
    <span
      className="w-6 h-6 rounded-md grid place-items-center flex-none"
      style={{
        background: "rgba(34,211,238,.08)",
        color: "#22D3EE",
      }}
    >
      {children}
    </span>
  );
  if (kind === "kpi") return wrap(<Hash {...common} />);
  if (kind === "trend") return wrap(<LineChartIcon {...common} />);
  if (kind === "table") return wrap(<Table2 {...common} />);
  return wrap(<BarChart3 {...common} />);
}

/* ── Helpers ──────────────────────────────────────────── */

function formatValue(
  value: number | null,
  format: string,
  unit?: string,
): { display: string; suffix?: string } {
  if (value === null || !Number.isFinite(value)) {
    return { display: "—" };
  }
  if (format === "currency") {
    const sym = currencySymbol(unit);
    const digits = Math.abs(value) >= 1000 ? 0 : 2;
    return {
      display: `${sym}${value.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })}`,
    };
  }
  if (format === "percent") {
    return {
      display: value.toLocaleString(undefined, { maximumFractionDigits: 2 }),
      suffix: "%",
    };
  }
  return {
    display: value.toLocaleString(undefined, {
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }),
    suffix: unit || undefined,
  };
}

function currencySymbol(unit?: string): string {
  switch ((unit || "").toUpperCase()) {
    case "EUR": return "€";
    case "GBP": return "£";
    case "INR": return "₹";
    case "JPY": return "¥";
    case "USD":
    default: return "$";
  }
}

function shortTick(v: unknown): string {
  const s = String(v ?? "");
  if (s.length > 12) return s.slice(0, 10) + "…";
  return s;
}

function askPromptFor(panel: DashboardPanelData): string {
  // Turn the panel title into a natural question
  const t = panel.title;
  if (panel.kind === "kpi") {
    return `Break down ${t.toLowerCase()} by a useful dimension.`;
  }
  if (panel.kind === "trend") {
    return `Explain the trend in ${t.toLowerCase()}.`;
  }
  if (panel.kind === "comparison") {
    return `${t} — which category leads and why?`;
  }
  if (panel.kind === "composition") {
    return `Compare the counts in "${t}".`;
  }
  return `Tell me about ${t.toLowerCase()}.`;
}

// Prevent an unused-import warning in strict builds
void useQuery;