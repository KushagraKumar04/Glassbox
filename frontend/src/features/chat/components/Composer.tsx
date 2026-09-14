import { Paperclip, Play, Square } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { RunState } from "../types";

interface Props {
  onRun: (question: string) => void;
  onCancel?: () => void;
  state: RunState;
  /** Rendered in the footer bar — typically the DatasetPicker. */
  sourceSlot?: ReactNode;
}

export function Composer({ onRun, onCancel, state, sourceSlot }: Props) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const running = state === "running";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [value]);

  const submit = () => {
    const q = value.trim();
    if (!q || running) return;
    onRun(q);
    setValue("");
  };

  return (
    <div
      className="flex-none px-5 py-4 border-t"
      style={{
        borderColor: "rgba(148,163,184,.16)",
        background: "rgba(11,16,32,.72)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <div className="glass rounded-2xl p-2.5">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            } else if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask your data…  e.g. Which region grew fastest month over month?"
          className="w-full bg-transparent resize-none outline-none px-2 py-1.5 text-[14px] placeholder:text-muted/55"
          style={{ maxHeight: 150 }}
          disabled={running}
        />

        <div className="flex items-center gap-2 px-1 pt-1.5 flex-wrap">
          {sourceSlot ?? (
            <button
              type="button"
              className="chip cursor-pointer hover:brightness-125 focusable"
              title="Attach a file (upload from Data Sources)"
            >
              <Paperclip size={10} strokeWidth={2} />
              attach
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="font-mono text-[10.5px] text-muted hidden sm:inline">
              ⌘↵ to run
            </span>

            {running ? (
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] text-[13px] font-semibold cursor-pointer focusable border"
                style={{
                  borderColor: "rgba(248,113,113,.35)",
                  color: "#F87171",
                  background: "rgba(248,113,113,.08)",
                }}
              >
                <Square size={12} fill="currentColor" />
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!value.trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] text-[13px] font-semibold cursor-pointer focusable disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(180deg,#22D3EE,#0EA5C4)",
                  color: "#04121A",
                  boxShadow: "0 0 24px -6px rgba(34,211,238,.55)",
                }}
              >
                <Play size={12} fill="currentColor" />
                Run
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}