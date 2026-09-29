/**
 * Autocomplete dropdown for the composer.
 *
 * Renders above the textarea. Controlled entirely by the parent — the
 * parent owns `activeIndex` so keyboard nav from the textarea flows
 * naturally into the list.
 */
import { History, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "@/shared/utils/cn";
import { formatRelative } from "@/shared/utils/time";

import type { HistoryMatch } from "../history-api";

interface Props {
  matches: HistoryMatch[];
  activeIndex: number;
  loading: boolean;
  onSelect: (question: string) => void;
  onHoverIndex: (index: number) => void;
  visible: boolean;
}

export function HistoryAutocomplete({
  matches,
  activeIndex,
  loading,
  onSelect,
  onHoverIndex,
  visible,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll active item into view
  useEffect(() => {
    if (!visible) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      '[data-active="true"]',
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, visible]);

  if (!visible) return null;

  // Nothing to show yet but still loading — small loading row
  if (matches.length === 0) {
    if (!loading) return null;
    return (
      <div
        className="glass-strong rounded-xl absolute bottom-full mb-2 left-0 right-0 z-50 px-3 py-2.5 flex items-center gap-2 fade-up"
        style={{ boxShadow: "0 20px 50px -12px rgba(0,0,0,.85)" }}
      >
        <Loader2 size={12} className="text-muted animate-spin" />
        <span className="text-[12px] text-muted">Searching history…</span>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="glass-strong rounded-xl absolute bottom-full mb-2 left-0 right-0 z-50 max-h-[280px] overflow-y-auto p-1.5 fade-up"
      style={{ boxShadow: "0 20px 50px -12px rgba(0,0,0,.85)" }}
      role="listbox"
    >
      <div className="px-2.5 py-1.5 font-mono text-[9.5px] uppercase tracking-wider text-muted/60">
        From your history
      </div>

      {matches.map((m, i) => {
        const isActive = i === activeIndex;
        return (
          <button
            key={i}
            type="button"
            data-active={isActive ? "true" : undefined}
            onMouseEnter={() => onHoverIndex(i)}
            onMouseDown={(e) => {
              // Prevent textarea blur before the click registers
              e.preventDefault();
              onSelect(m.question);
            }}
            className={cn(
              "w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left cursor-pointer transition-colors",
              isActive ? "bg-cyan/10" : "hover:bg-white/5",
            )}
            role="option"
            aria-selected={isActive}
          >
            <History
              size={13}
              className={cn(
                "flex-none mt-0.5",
                isActive ? "text-cyan" : "text-muted/60",
              )}
              strokeWidth={2}
            />
            <span className="min-w-0 flex-1">
              <span className="text-[12.5px] block truncate">
                {m.question}
              </span>
              <span className="font-mono text-[10px] text-muted/70 block mt-0.5">
                {formatRelative(m.last_used_at)}
                {m.count > 1 && ` · asked ${m.count}×`}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}