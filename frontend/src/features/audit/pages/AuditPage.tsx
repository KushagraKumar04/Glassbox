import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  ScrollText,
} from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/shared/utils/cn";
import { formatAbsolute, formatRelative } from "@/shared/utils/time";

import { auditApi, type AuditEvent } from "../api";

const PAGE_SIZE = 50;

const ACTION_COLORS: Record<string, string> = {
  auth: "#22D3EE",
  dataset: "#8B5CF6",
  source: "#34D399",
  run: "#FBBF24",
  template: "#A78BFA",
  metric: "#F472B6",
  system: "#F87171",
  rate_limit: "#F87171",
};

function actionPrefix(action: string): string {
  return action.split(".")[0] ?? "other";
}

function actionColor(action: string): string {
  return ACTION_COLORS[actionPrefix(action)] ?? "#AAB6CC";
}

export function AuditPage() {
  const [action, setAction] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [days, setDays] = useState<number>(7);
  const [page, setPage] = useState<number>(0);

  const filters = useMemo(
    () => ({
      action: action || undefined,
      search: search.trim() || undefined,
      days,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [action, search, days, page],
  );

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["audit", filters],
    queryFn: () => auditApi.list(filters),
    staleTime: 15_000,
  });

  const { data: actionsData } = useQuery({
    queryKey: ["audit", "actions"],
    queryFn: auditApi.actions,
    staleTime: 5 * 60_000,
  });

  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetFilters = () => {
    setAction("");
    setSearch("");
    setDays(7);
    setPage(0);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1200px] mx-auto px-6 pt-8 pb-12">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-mono text-[20px] font-semibold tracking-tight flex items-center gap-2">
              <ScrollText size={18} className="text-cyan" strokeWidth={2} />
              Audit Log
            </h2>
            <p className="text-muted text-[13px] mt-1 max-w-[560px]">
              Every security-relevant action — sign-ins, uploads, source
              changes, deletions. Append-only, {days}-day window by default.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="btn-chip focusable cursor-pointer"
          >
            <RefreshCw
              size={11}
              strokeWidth={2}
              className={isFetching ? "animate-spin" : ""}
            />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div
          className="glass rounded-2xl p-3 mb-4 flex items-center gap-2 flex-wrap"
        >
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(0);
            }}
            className="input font-mono text-[12px]"
            style={{ width: "auto", minWidth: 180 }}
          >
            <option value="">All actions</option>
            {(actionsData?.actions ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>

          <select
            value={days}
            onChange={(e) => {
              setDays(Number(e.target.value));
              setPage(0);
            }}
            className="input font-mono text-[12px]"
            style={{ width: "auto", minWidth: 130 }}
          >
            <option value={1}>Last 24 hours</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>

          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] border flex-1 min-w-[200px] max-w-[320px]"
            style={{ borderColor: "rgba(148,163,184,.16)" }}
          >
            <Search size={12} strokeWidth={2} className="text-muted flex-none" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search user, IP, target…"
              className="flex-1 bg-transparent outline-none text-[12px] placeholder:text-muted/55"
            />
          </div>

          {(action || search || days !== 7) && (
            <button
              type="button"
              onClick={resetFilters}
              className="btn-chip focusable cursor-pointer"
            >
              Reset
            </button>
          )}

          <span className="ml-auto font-mono text-[10.5px] text-muted">
            {total.toLocaleString()} event{total === 1 ? "" : "s"}
          </span>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="shimmer rounded-lg h-[44px]"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center">
            <ScrollText
              size={28}
              className="text-muted/40 mx-auto mb-3"
              strokeWidth={1.8}
            />
            <div className="text-muted text-[13px] mb-1">
              No events in this window
            </div>
            <div className="text-muted/70 text-[12px]">
              {action || search
                ? "Try clearing filters or widening the date range."
                : "Actions will appear here as you use the app."}
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {events.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="btn-chip focusable cursor-pointer disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="font-mono text-[11px] text-muted">
              Page {page + 1} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="btn-chip focusable cursor-pointer disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Row ─────────────────────────────────────────────────── */

function EventRow({ event }: { event: AuditEvent }) {
  const [expanded, setExpanded] = useState(false);

  const prefix = actionPrefix(event.action);
  const color = actionColor(event.action);

  const detailKeys = Object.keys(event.details ?? {});

  return (
    <div
      className="glass glass-hover rounded-xl overflow-hidden transition-colors"
      style={{
        borderLeft: `3px solid ${color}`,
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-3.5 py-2.5 cursor-pointer focusable text-left"
      >
        {/* Time */}
        <div className="w-[110px] flex-none">
          <div className="font-mono text-[11.5px] text-txt/85">
            {formatRelative(event.created_at)}
          </div>
          <div
            className="font-mono text-[10px] text-muted/70 truncate"
            title={event.created_at}
          >
            {formatAbsolute(event.created_at).split(",")[1]?.trim() ?? ""}
          </div>
        </div>

        {/* Action badge */}
        <span
          className="font-mono text-[10.5px] px-2 py-0.5 rounded flex-none"
          style={{
            background: `${color}22`,
            color,
            border: `1px solid ${color}44`,
          }}
        >
          {event.action}
        </span>

        {/* User */}
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] truncate">
            {event.username || (
              <span className="text-muted italic">anonymous</span>
            )}
          </div>
          {(event.target_type || event.target_id) && (
            <div className="font-mono text-[10px] text-muted truncate">
              {event.target_type}
              {event.target_id && ` · ${event.target_id}`}
            </div>
          )}
        </div>

        {/* IP */}
        <div className="font-mono text-[10.5px] text-muted flex-none hidden md:block">
          {event.ip || "—"}
        </div>

        {/* Chevron */}
        <div className="text-muted flex-none">
          {expanded ? (
            <ChevronDown size={14} strokeWidth={2} />
          ) : (
            <ChevronRight size={14} strokeWidth={2} />
          )}
        </div>
      </button>

      {expanded && (
        <div
          className="px-3.5 pb-3.5 pt-1 text-[11.5px]"
          style={{ borderTop: "1px solid rgba(148,163,184,.12)" }}
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 font-mono mb-3 mt-3">
            <div className="flex justify-between gap-3">
              <span className="text-muted/70">id</span>
              <span className="text-txt/85 truncate">{event.id}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted/70">user_id</span>
              <span className="text-txt/85 truncate">
                {event.user_id ?? "—"}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted/70">action</span>
              <span className="text-txt/85">{event.action}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted/70">target</span>
              <span className="text-txt/85 truncate">
                {event.target_type}
                {event.target_id && ` / ${event.target_id}`}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted/70">ip</span>
              <span className="text-txt/85">{event.ip || "—"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted/70">created_at</span>
              <span className="text-txt/85 truncate">
                {formatAbsolute(event.created_at)}
              </span>
            </div>
          </div>

          {detailKeys.length > 0 && (
            <div
              className="rounded-lg p-3 font-mono text-[11px] whitespace-pre-wrap break-words"
              style={{
                background: "var(--aida-code-bg)",
                border: "1px solid rgba(148,163,184,.16)",
                color: "#AAB6CC",
              }}
            >
              {JSON.stringify(event.details, null, 2)}
            </div>
          )}

          {event.user_agent && (
            <div className="mt-3 font-mono text-[10.5px] text-muted/70 truncate">
              UA: {event.user_agent}
            </div>
          )}
        </div>
      )}
    </div>
  );
}