import { Layers, Pencil, Play, Trash2 } from "lucide-react";
import { useState } from "react";

import { cn } from "@/shared/utils/cn";

import type { Template } from "../api";

interface Props {
  template: Template;
  onUse: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function TemplateCard({ template, onUse, onEdit, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);
  const editable = !template.is_builtin;

  return (
    <div className="glass glass-hover rounded-2xl p-4 flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-7 h-7 rounded-lg grid place-items-center flex-none"
            style={{
              background: template.is_builtin
                ? "rgba(139,92,246,.12)"
                : "rgba(34,211,238,.12)",
              border: template.is_builtin
                ? "1px solid rgba(139,92,246,.25)"
                : "1px solid rgba(34,211,238,.25)",
            }}
            aria-hidden="true"
          >
            <Layers
              size={13}
              className={template.is_builtin ? "text-violet" : "text-cyan"}
              strokeWidth={1.9}
            />
          </div>
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium truncate">
              {template.name}
            </div>
            <div className="font-mono text-[10px] text-muted">
              {template.is_builtin ? "built-in" : "personal"}
              {template.usage_count > 0 && ` · used ${template.usage_count}×`}
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      {template.description && (
        <div className="text-[12.5px] text-muted leading-relaxed mb-3 line-clamp-2">
          {template.description}
        </div>
      )}

      {/* Question preview */}
      <div
        className="rounded-lg p-2.5 mb-3 text-[12px] font-mono leading-relaxed"
        style={{
          background: "rgba(3,7,18,.5)",
          border: "1px solid rgba(148,163,184,.16)",
          color: "#AAB6CC",
        }}
      >
        <div className="line-clamp-3">{template.question}</div>
      </div>

      {/* Tags */}
      {template.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {template.tags.slice(0, 4).map((t) => (
            <span
              key={t}
              className="font-mono text-[10px] px-1.5 py-0.5 rounded border"
              style={{
                borderColor: "rgba(148,163,184,.16)",
                color: "#AAB6CC",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 mt-auto pt-2">
        <button
          type="button"
          onClick={onUse}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer focusable flex-1 justify-center"
          style={{
            background: "linear-gradient(180deg,#22D3EE,#0EA5C4)",
            color: "#04121A",
          }}
        >
          <Play size={11} strokeWidth={2.5} fill="currentColor" />
          Use
        </button>

        {editable && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-muted hover:text-txt transition-colors cursor-pointer focusable p-1.5"
            title="Edit"
          >
            <Pencil size={13} strokeWidth={1.8} />
          </button>
        )}

        {editable && onDelete && !confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={cn(
              "text-muted hover:text-err transition-colors cursor-pointer focusable p-1.5",
            )}
            title="Delete"
          >
            <Trash2 size={13} strokeWidth={1.8} />
          </button>
        )}

        {editable && onDelete && confirming && (
          <div className="flex gap-1">
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
              Yes
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-2 py-1 rounded-md text-[10.5px] text-muted cursor-pointer focusable"
              style={{ border: "1px solid rgba(148,163,184,.16)" }}
            >
              No
            </button>
          </div>
        )}
      </div>
    </div>
  );
}