/**
 * Command palette (⌘K / Ctrl+K).
 *
 * Sources:
 *   - Ask           — free-form question → runs in workspace
 *   - Navigation    — Home, Sources, Workspace, Dashboard, History, …
 *   - Recent runs   — click → open the run detail
 *   - Templates     — click → run the template's question
 *   - Actions       — toggle inspector, start a new analysis
 *
 * Keyboard:
 *   - ⌘K / Ctrl+K   open
 *   - ESC            close
 *   - ↑ / ↓          navigate
 *   - Enter          execute
 *   - Shift+Enter    execute the "Ask" item regardless of selection
 */
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Compass,
  History as HistoryIcon,
  Layers,
  Search,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { runsApi, type RunSummary } from "@/features/history/api";
import { useInspector } from "@/features/inspector/store";
import { useShortcuts } from "@/features/shortcuts/store";
import { useTour } from "@/features/onboarding/store";
import { templatesApi, type Template } from "@/features/templates/api";
import { cn } from "@/shared/utils/cn";

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  kind: "nav" | "run" | "template" | "action" | "ask";
  action: () => void;
}

const _RECENT_RUNS = 6;
const _TEMPLATE_LIMIT = 6;
const _MAX_QUESTION_CHARS = 500;

export function CommandPalette() {
  const nav = useNavigate();
  const toggleInspector = useInspector((s) => s.toggle);
  const openShortcuts = useShortcuts((s) => s.setOpen);
  const startTour = useTour((s) => s.start);
  const resetTour = useTour((s) => s.reset);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: runs = [] } = useQuery<RunSummary[]>({
    queryKey: ["runs", "palette"],
    queryFn: () => runsApi.list(20),
    enabled: open,
    staleTime: 30_000,
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["templates", "palette"],
    queryFn: templatesApi.list,
    enabled: open,
    staleTime: 60_000,
  });

  // ── Global keyboard open/close ─────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape" && open) setOpen(false);
    };
    const onOpenEvent = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onOpenEvent);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onOpenEvent);
    };
  }, [open]);

  // ── Reset on open ──────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // ── Reset selection when query changes ─────────────────────
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // ── Ask action (navigates to workspace, fires the question) ─
  const askAction = (raw: string) => {
    const trimmed = raw.trim().slice(0, _MAX_QUESTION_CHARS);
    if (!trimmed) return;
    setOpen(false);
    // Add a tiny key so repeated navigations to the same q still
    // update the URL search params and fire the effect.
    const next = new URLSearchParams();
    next.set("q", trimmed);
    nav(`/workspace?${next.toString()}`);
  };

  // ── Build the base item list ───────────────────────────────
  const baseItems: CommandItem[] = useMemo(() => {
    const closeAnd = (fn: () => void) => () => {
      setOpen(false);
      fn();
    };

    const nav_items: CommandItem[] = [
      { id: "nav-home", label: "Go to Home", hint: "⌘1", kind: "nav",
        action: closeAnd(() => nav("/home")) },
      { id: "nav-sources", label: "Go to Data Sources", hint: "⌘2", kind: "nav",
        action: closeAnd(() => nav("/sources")) },
      { id: "nav-workspace", label: "Go to Workspace", hint: "⌘3", kind: "nav",
        action: closeAnd(() => nav("/workspace")) },
      { id: "nav-dashboard", label: "Go to Dashboard", hint: "⌘4", kind: "nav",
        action: closeAnd(() => nav("/dashboard")) },
      { id: "nav-history", label: "Go to History", hint: "⌘5", kind: "nav",
        action: closeAnd(() => nav("/history")) },
      { id: "nav-templates", label: "Go to Templates", hint: "⌘6", kind: "nav",
        action: closeAnd(() => nav("/templates")) },
      { id: "nav-metrics", label: "Go to Metrics (business glossary)", hint: "⌘7",
        kind: "nav", action: closeAnd(() => nav("/metrics")) },
      { id: "nav-audit", label: "Go to Audit Log", hint: "⌘8", kind: "nav",
        action: closeAnd(() => nav("/audit")) },
      { id: "nav-settings", label: "Go to Settings", hint: "⌘9", kind: "nav",
        action: closeAnd(() => nav("/settings")) },
    ];

    const action_items: CommandItem[] = [
      { id: "act-toggle-inspector", label: "Toggle inspector panel", hint: "⌘I",
        kind: "action", action: closeAnd(toggleInspector) },
      { id: "act-new-run", label: "Start a new analysis", hint: "⌘N",
        kind: "action", action: closeAnd(() => nav("/workspace")) },
      { id: "act-shortcuts", label: "Show keyboard shortcuts", hint: "⌘/",
        kind: "action", action: () => {
          setOpen(false);
          openShortcuts(true);
        } },
      { id: "act-tour", label: "Restart onboarding tour", hint: "guided walkthrough",
        kind: "action", action: () => {
          setOpen(false);
          resetTour();
          // Give React a tick so the store updates before the tour starts
          window.setTimeout(() => startTour(), 50);
        } },
    ];

    const run_items: CommandItem[] = runs.slice(0, _RECENT_RUNS).map((r) => ({
      id: `run-${r.id}`,
      label: r.question,
      hint: `${(r.elapsed_ms / 1000).toFixed(1)}s · ${new Date(
        r.created_at,
      ).toLocaleDateString()}`,
      kind: "run" as const,
      action: closeAnd(() => nav(`/history/${r.id}`)),
    }));

    const tpl_items: CommandItem[] = templates
      .slice(0, _TEMPLATE_LIMIT)
      .map((t) => ({
        id: `tpl-${t.id}`,
        label: t.name,
        hint: t.is_builtin ? "built-in template" : "personal template",
        kind: "template" as const,
        action: closeAnd(() =>
          nav(`/workspace?q=${encodeURIComponent(t.question)}`),
        ),
      }));

    return [...nav_items, ...action_items, ...tpl_items, ...run_items];
  }, [nav, runs, templates, toggleInspector, openShortcuts, startTour, resetTour]);

  // ── Filter + prepend the ask item ──────────────────────────
  const filtered: CommandItem[] = useMemo(() => {
    const q = query.trim();

    const matches = q
      ? baseItems.filter(
          (it) =>
            it.label.toLowerCase().includes(q.toLowerCase()) ||
            (it.hint ?? "").toLowerCase().includes(q.toLowerCase()),
        )
      : baseItems;

    if (!q) return matches;

    // Prepend the free-form Ask item
    const askItem: CommandItem = {
      id: "ask-current",
      label: q,
      hint: "Ask this question in the workspace",
      kind: "ask",
      action: () => askAction(q),
    };

    return [askItem, ...matches];
  }, [baseItems, query]);

  // ── Scroll the active item into view ───────────────────────
  useEffect(() => {
    if (!open) return;
    const container = listRef.current;
    if (!container) return;
    const active = container.querySelector<HTMLElement>(
      '[data-active="true"]',
    );
    active?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex, open]);

  // ── Keyboard handling ──────────────────────────────────────
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Shift+Enter always triggers the Ask action when a query exists
      if (e.shiftKey && query.trim()) {
        askAction(query);
        return;
      }
      filtered[activeIndex]?.action();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[14vh] px-4"
      style={{ background: "rgba(3,7,18,.65)", backdropFilter: "blur(6px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        className="glass-strong rounded-2xl w-[620px] max-w-full overflow-hidden fade-up"
        style={{ boxShadow: "0 30px 90px -12px rgba(0,0,0,.85)" }}
      >
        {/* Input */}
        <div
          className="flex items-center gap-3 px-4 py-3.5 border-b"
          style={{ borderColor: "var(--aida-border)" }}
        >
          <Search size={16} className="text-cyan flex-none" strokeWidth={2} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask a question, or type a command…"
            className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-muted/55"
          />
          <kbd
            className="font-mono text-[10px] px-1.5 py-0.5 rounded border text-muted"
            style={{ borderColor: "var(--aida-border)" }}
          >
            ESC
          </kbd>
        </div>

        {/* List */}
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12.5px] text-muted">
              Type a question to ask, or search for a command.
            </div>
          ) : (
            filtered.map((it, idx) => (
              <button
                key={it.id}
                type="button"
                data-active={idx === activeIndex ? "true" : undefined}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => it.action()}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left cursor-pointer transition-colors",
                  idx === activeIndex && "bg-cyan/10",
                  it.kind === "ask" && "mt-0.5 mb-1",
                )}
                style={
                  it.kind === "ask"
                    ? {
                        background:
                          idx === activeIndex
                            ? "rgba(34,211,238,.14)"
                            : "rgba(34,211,238,.05)",
                        border: "1px dashed rgba(34,211,238,.35)",
                      }
                    : undefined
                }
              >
                <span className="flex-none">
                  {it.kind === "nav" && (
                    <Compass
                      size={14}
                      className={idx === activeIndex ? "text-cyan" : "text-muted"}
                      strokeWidth={2}
                    />
                  )}
                  {it.kind === "run" && (
                    <HistoryIcon
                      size={14}
                      className={idx === activeIndex ? "text-cyan" : "text-muted"}
                      strokeWidth={2}
                    />
                  )}
                  {it.kind === "template" && (
                    <Layers
                      size={14}
                      className={idx === activeIndex ? "text-violet" : "text-muted"}
                      strokeWidth={2}
                    />
                  )}
                  {it.kind === "action" && (
                    <Sparkles
                      size={14}
                      className={idx === activeIndex ? "text-cyan" : "text-muted"}
                      strokeWidth={2}
                    />
                  )}
                  {it.kind === "ask" && (
                    <WandSparkles
                      size={14}
                      className="text-cyan"
                      strokeWidth={2.2}
                    />
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span
                    className={cn(
                      "block truncate",
                      it.kind === "ask"
                        ? "text-[13.5px] text-txt"
                        : "text-[13px]",
                    )}
                  >
                    {it.kind === "ask" ? `Ask: ${it.label}` : it.label}
                  </span>
                  {it.hint && (
                    <span className="font-mono text-[10.5px] text-muted block truncate">
                      {it.hint}
                    </span>
                  )}
                </span>
                {idx === activeIndex && (
                  <ArrowRight
                    size={12}
                    className="text-cyan flex-none"
                    strokeWidth={2}
                  />
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          className="px-4 py-2.5 border-t flex items-center gap-3 font-mono text-[10.5px] text-muted/70"
          style={{ borderColor: "var(--aida-border)" }}
        >
          <span>↑↓ navigate</span>
          <span>·</span>
          <span>↵ select</span>
          <span>·</span>
          <span>⇧↵ ask</span>
          <span>·</span>
          <span>esc close</span>
          <span className="ml-auto">{filtered.length} results</span>
        </div>
      </div>
    </div>
  );
}