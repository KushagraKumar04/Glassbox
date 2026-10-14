import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  CircleAlert,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { PinButton } from "../components/PinButton";
import { runsApi, type RunSummary } from "../api";

export function HistoryPage() {
  const nav = useNavigate();
  const { data, isLoading, isFetching, refetch } = useQuery<RunSummary[]>({
    queryKey: ["runs"],
    queryFn: () => runsApi.list(100),
  });

  const pinnedCount = (data ?? []).filter((r) => r.pinned).length;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[980px] mx-auto px-6 pt-8 pb-12">
        <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-mono text-[20px] font-semibold tracking-tight">
              History
            </h2>
            <p className="text-muted text-[13px] mt-1 max-w-[560px]">
              Every run persists inputs, code versions and result metadata.
              Click any run to reopen its full trace. Star runs to pin them
              to Home.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pinnedCount > 0 && (
              <span
                className="chip"
                style={{
                  borderColor: "rgba(251,191,36,.3)",
                  color: "#FBBF24",
                }}
              >
                <Star
                  size={10}
                  strokeWidth={2.5}
                  fill="#FBBF24"
                />
                {pinnedCount} pinned
              </span>
            )}
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
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="shimmer rounded-xl h-[74px]"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : data && data.length > 0 ? (
          <div className="space-y-2">
            {data.map((r) => (
              <RunRow
                key={r.id}
                run={r}
                onOpen={() => nav(`/history/${r.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="glass rounded-2xl p-12 text-center">
            <div className="font-mono text-[12px] text-muted mb-1">
              No runs yet
            </div>
            <div className="text-muted/70 text-[12.5px] mb-5">
              Ask a question from Home and it will appear here.
            </div>
            <button
              type="button"
              onClick={() => nav("/home")}
              className="btn-chip focusable cursor-pointer mx-auto"
            >
              Go to Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RunRow({
  run,
  onOpen,
}: {
  run: RunSummary;
  onOpen: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await runsApi.remove(run.id);
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  const ok = run.status === "completed";
  const when = new Date(run.created_at);
  const relative = formatRelative(when);

  return (
    <div
      className="glass glass-hover rounded-xl p-3.5 cursor-pointer transition-colors flex items-center gap-3 focusable"
      onClick={onOpen}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
    >
      <span
        className="w-7 h-7 rounded-lg grid place-items-center flex-none"
        style={{
          background: ok
            ? "rgba(52,211,153,.12)"
            : "rgba(248,113,113,.12)",
          border: ok
            ? "1px solid rgba(52,211,153,.3)"
            : "1px solid rgba(248,113,113,.3)",
        }}
        aria-hidden="true"
      >
        {ok ? (
          <Check size={12} className="text-ok" strokeWidth={2.5} />
        ) : (
          <CircleAlert size={12} className="text-err" strokeWidth={2.5} />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium truncate">
          {run.question}
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {run.pinned && (
            <>
              <span
                className="inline-flex items-center gap-1 font-mono text-[10px]"
                style={{ color: "#FBBF24" }}
              >
                <Star size={9} strokeWidth={2.5} fill="#FBBF24" />
                pinned
              </span>
              <span className="font-mono text-[10.5px] text-muted/60">·</span>
            </>
          )}
          <span className="font-mono text-[10.5px] text-muted">
            {relative}
          </span>
          <span className="font-mono text-[10.5px] text-muted/60">·</span>
          <span className="font-mono text-[10.5px] text-muted">
            {(run.elapsed_ms / 1000).toFixed(1)}s
          </span>
          {run.dataset_count > 0 && (
            <>
              <span className="font-mono text-[10.5px] text-muted/60">·</span>
              <span className="font-mono text-[10.5px] text-muted">
                {run.dataset_count} file{run.dataset_count === 1 ? "" : "s"}
              </span>
            </>
          )}
        </div>
      </div>

      <div
        className="flex items-center gap-1 flex-none"
        onClick={(e) => e.stopPropagation()}
      >
        <PinButton runId={run.id} pinned={run.pinned} />
        {confirming ? (
          <>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="px-2 py-1 rounded-md text-[10.5px] cursor-pointer focusable"
              style={{
                background: "rgba(248,113,113,.15)",
                color: "#F87171",
                border: "1px solid rgba(248,113,113,.3)",
              }}
            >
              {busy ? "…" : "Delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-2 py-1 rounded-md text-[10.5px] text-muted cursor-pointer focusable"
              style={{ border: "1px solid var(--aida-border)" }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(true);
            }}
            className="text-muted hover:text-err transition-colors cursor-pointer p-1.5 focusable"
            title="Delete run"
          >
            <Trash2 size={13} strokeWidth={1.8} />
          </button>
        )}
        <ArrowRight
          size={14}
          className="text-muted ml-1"
          strokeWidth={2}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function formatRelative(d: Date): string {
  const now = Date.now();
  const diff = now - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
}