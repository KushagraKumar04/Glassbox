/**
 * Star toggle for a run. Optimistic — flips instantly, reverts on failure.
 *
 * Uses the shared runsApi.setPinned() and invalidates both the runs list
 * and the pinned list so Home updates without a manual refetch.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";

import { runsApi } from "../api";

interface Props {
  runId: string;
  pinned: boolean;
  /** Icon size in pixels. Default 14. */
  size?: number;
  /** Optional callback after a successful toggle. */
  onToggled?: (pinned: boolean) => void;
}

export function PinButton({ runId, pinned, size = 14, onToggled }: Props) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (next: boolean) => runsApi.setPinned(runId, next),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["runs"] });
      qc.invalidateQueries({ queryKey: ["runs", "pinned"] });
      qc.invalidateQueries({ queryKey: ["run", runId] });
      onToggled?.(data.pinned);
    },
  });

  const busy = mutation.isPending;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (busy) return;
        mutation.mutate(!pinned);
      }}
      disabled={busy}
      className="transition-colors cursor-pointer focusable p-1.5 disabled:opacity-50"
      style={{
        color: pinned ? "#FBBF24" : "var(--aida-muted)",
      }}
      title={pinned ? "Unpin from Home" : "Pin to Home"}
      aria-label={pinned ? "Unpin" : "Pin"}
      aria-pressed={pinned}
    >
      <Star
        size={size}
        strokeWidth={1.9}
        fill={pinned ? "#FBBF24" : "transparent"}
      />
    </button>
  );
}