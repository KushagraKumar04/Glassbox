/**
 * "Pinned analyses" strip on Home.
 *
 * Renders nothing when no runs are pinned. Caps at 3 cards on the strip —
 * the "view all" link goes to /history.
 */
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { PinButton } from "@/features/history/components/PinButton";
import { runsApi, type RunSummary } from "@/features/history/api";
import { formatRelative } from "@/shared/utils/time";

const _MAX_SHOWN = 3;

export function PinnedRuns() {
  const nav = useNavigate();

  const { data: runs = [] } = useQuery<RunSummary[]>({
    queryKey: ["runs", "pinned"],
    queryFn: () => runsApi.listPinned(12),
    staleTime: 30_000,
  });

  if (runs.length === 0) return null;

  const shown = runs.slice(0, _MAX_SHOWN);

  return (
    <div className="mb-10">
      <div className="flex items-center gap-2 mb-3">
        <Star
          size={12}
          className="text-warn flex-none"
          strokeWidth={2.2}
          fill="#FBBF24"
        />
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted/70">
          Pinned analyses
        </div>
        <button
          type="button"
          onClick={() => nav("/history")}
          className="font-mono text-[10.5px] text-muted/60 hover:text-cyan cursor-pointer focusable ml-auto"
        >
          view all →
        </button>
      </div>

      <div className="grid sm:grid-cols-3 gap-2.5">
        {shown.map((r) => (
          <div
            key={r.id}
            className="glass glass-hover rounded-xl p-3.5 flex flex-col group cursor-pointer transition-colors"
            onClick={() => nav(`/history/${r.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") nav(`/history/${r.id}`);
            }}
          >
            <div className="flex items-start gap-2 mb-2">
              <Star
                size={11}
                className="text-warn flex-none mt-0.5"
                strokeWidth={2.2}
                fill="#FBBF24"
              />
              <span className="text-[13px] font-medium leading-snug line-clamp-2">
                {r.question}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-auto pt-2 flex-wrap">
              <span className="font-mono text-[10px] text-muted/70">
                {(r.elapsed_ms / 1000).toFixed(1)}s
              </span>
              <span className="font-mono text-[10px] text-muted/50">·</span>
              <span className="font-mono text-[10px] text-muted/70">
                {formatRelative(r.created_at)}
              </span>

              <div
                className="ml-auto flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <PinButton runId={r.id} pinned={true} size={12} />
                <ArrowRight
                  size={11}
                  className="text-muted/50 group-hover:text-cyan transition-colors"
                  strokeWidth={2}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}