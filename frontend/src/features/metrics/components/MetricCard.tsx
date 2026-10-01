import { Pencil, Sigma, Trash2 } from "lucide-react";
import { useState } from "react";

import type { Metric } from "../api";

interface Props {
  metric: Metric;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function MetricCard({ metric, onEdit, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);
  const editable = !metric.is_builtin;

  return (
    <div className="glass glass-hover rounded-2xl p-4 flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-lg grid place-items-center flex-none"
            style={{
              background: metric.is_builtin
                ? "rgba(139,92,246,.12)"
                : "rgba(34,211,238,.12)",
              border: metric.is_builtin
                ? "1px solid rgba(139,92,246,.25)"
                : "1px solid rgba(34,211,238,.25)",
            }}
            aria-hidden="true"
          >
            <Sigma
              size={14}
              className={metric.is_builtin ? "text-violet" : "text-cyan"}
              strokeWidth={2}
            />
          </div>
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium truncate">
              {metric.name}
            </div>
            <div className="font-mono text-[10px] text-muted truncate">
              {metric.is_builtin ? "built-in" : "custom"}
              {metric.category && ` · ${metric.category}`}
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      {metric.description && (
        <div className="text-[12.5px] text-muted leading-relaxed mb-3 line-clamp-3">
          {metric.description}
        </div>
      )}

      {/* SQL expression */}
      {metric.sql_expression && (
        <div
          className="rounded-lg p-2.5 mb-3 text-[11.5px] font-mono leading-relaxed whitespace-pre-wrap break-words"
          style={{
            background: "var(--aida-code-bg)",
            border: "1px solid var(--aida-border)",
            color: "var(--aida-ok)",
          }}
        >
          {metric.sql_expression}
        </div>
      )}

      {/* Synonyms */}
      {metric.synonyms.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {metric.synonyms.slice(0, 6).map((s) => (
            <span
              key={s}
              className="font-mono text-[10px] px-1.5 py-0.5 rounded border"
              style={{
                borderColor: "var(--aida-border)",
                color: "var(--aida-muted)",
              }}
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      {editable && (
        <div
          className="flex items-center gap-1 mt-auto pt-2 border-t"
          style={{ borderColor: "var(--aida-border)" }}
        >
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="text-muted hover:text-txt transition-colors cursor-pointer focusable p-1.5"
              title="Edit"
            >
              <Pencil size={13} strokeWidth={1.8} />
            </button>
          )}

          {onDelete && !confirming && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-muted hover:text-[#F87171] transition-colors cursor-pointer focusable p-1.5"
              title="Delete"
            >
              <Trash2 size={13} strokeWidth={1.8} />
            </button>
          )}

          {onDelete && confirming && (
            <div className="flex gap-1 items-center ml-auto">
              <button
                type="button"
                onClick={onDelete}
                className="px-2 py-1 rounded-md text-[10.5px] cursor-pointer focusable"
                style={{
                  background: "rgba(248,113,113,.15)",
                  color: "#F87171",
                  border: "1px solid rgba(248,113,113,.3)",
                }}
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-2 py-1 rounded-md text-[10.5px] text-muted cursor-pointer focusable"
                style={{ border: "1px solid var(--aida-border)" }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}