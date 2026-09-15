import { Paperclip, Play, Square } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { HistoryAutocomplete } from "@/features/suggestions/components/HistoryAutocomplete";
import { useQuestionHistory } from "@/features/suggestions/useQuestionHistory";

import type { RunState } from "../types";

interface Props {
  onRun: (question: string) => void;
  onCancel?: () => void;
  state: RunState;
  sourceSlot?: ReactNode;
}

export function Composer({ onRun, onCancel, state, sourceSlot }: Props) {
  const [value, setValue] = useState("");
  const [autocompleteVisible, setAutocompleteVisible] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const ref = useRef<HTMLTextAreaElement>(null);
  const running = state === "running";

  const { matches, isLoading } = useQuestionHistory(value);

  // Auto-grow
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [value]);

  // Reset active index when matches change
  useEffect(() => {
    if (activeIndex >= matches.length) setActiveIndex(0);
  }, [matches.length, activeIndex]);

  // Close autocomplete when input is cleared or too short
  useEffect(() => {
    if (value.trim().length < 3) {
      setAutocompleteVisible(false);
    }
  }, [value]);

  const submit = () => {
    const q = value.trim();
    if (!q || running) return;
    onRun(q);
    setValue("");
    setAutocompleteVisible(false);
  };

  const acceptMatch = (question: string) => {
    setValue(question);
    setAutocompleteVisible(false);
    // Focus back to the textarea, caret at end
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(question.length, question.length);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const listOpen =
      autocompleteVisible && matches.length > 0;

    // ⌘↵ always submits
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
      return;
    }

    // Arrow down opens the list, or moves within it
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!listOpen) {
        if (matches.length > 0) {
          setAutocompleteVisible(true);
          setActiveIndex(0);
        }
      } else {
        setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
      }
      return;
    }

    if (e.key === "ArrowUp" && listOpen) {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }

    if (e.key === "Escape" && listOpen) {
      e.preventDefault();
      setAutocompleteVisible(false);
      return;
    }

    // Enter accepts the highlighted match (does NOT submit)
    if (e.key === "Enter" && listOpen && !e.shiftKey) {
      e.preventDefault();
      acceptMatch(matches[activeIndex].question);
      return;
    }

    // Plain Enter submits (no list open)
    if (e.key === "Enter" && !e.shiftKey && !listOpen) {
      e.preventDefault();
      submit();
      return;
    }
  };

  const onChange = (v: string) => {
    setValue(v);
    // Show list as soon as we have enough chars (matches will load async)
    if (v.trim().length >= 3) {
      setAutocompleteVisible(true);
    }
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
        {/* Textarea + autocomplete wrapper */}
        <div className="relative">
          <HistoryAutocomplete
            matches={matches}
            activeIndex={activeIndex}
            loading={isLoading}
            visible={autocompleteVisible && value.trim().length >= 3}
            onSelect={acceptMatch}
            onHoverIndex={setActiveIndex}
          />

          <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => {
              // Delay close so mouse clicks on the dropdown register
              window.setTimeout(() => setAutocompleteVisible(false), 150);
            }}
            onFocus={() => {
              if (value.trim().length >= 3) setAutocompleteVisible(true);
            }}
            placeholder="Ask your data…  e.g. Which region grew fastest month over month?"
            className="w-full bg-transparent resize-none outline-none px-2 py-1.5 text-[14px] placeholder:text-muted/55"
            style={{ maxHeight: 150 }}
            disabled={running}
          />
        </div>

        {/* Footer */}
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
              {autocompleteVisible && matches.length > 0
                ? "↑↓ · ↵ select · esc close"
                : "⌘↵ to run"}
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