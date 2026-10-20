/**
 * Registers every global keyboard shortcut.
 *
 * Skips when:
 *   - the focused element is an input, textarea, select, or contenteditable
 *     (so typing "1" in the composer doesn't navigate home)
 *   - inside a Monaco editor
 *   - the command palette is open (it owns the keyboard)
 *   - the shortcuts modal is open (except for the close key)
 *
 * ⌘K is intentionally NOT handled here — the palette manages its own open/close.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useInspector } from "@/features/inspector/store";

import { useShortcuts } from "./store";

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  // Monaco wraps its textarea in .monaco-editor
  if (target.closest(".monaco-editor")) return true;
  return false;
}

export function useGlobalShortcuts() {
  const nav = useNavigate();
  const toggleInspector = useInspector((s) => s.toggle);
  const closeShortcuts = useShortcuts((s) => s.setOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Escape always closes the shortcuts modal
      if (e.key === "Escape") {
        const open = useShortcuts.getState().open;
        if (open) {
          e.preventDefault();
          closeShortcuts(false);
          return;
        }
      }

      // While the shortcuts modal is open, swallow everything else
      if (useShortcuts.getState().open) return;

      // Skip if the user is typing
      if (isEditable(e.target)) return;

      // ⌘/ — show shortcuts reference (works even from inputs, so check first)
      if (mod && (e.key === "/" || e.key === "?")) {
        e.preventDefault();
        useShortcuts.getState().setOpen(true);
        return;
      }

      if (!mod) return;

      // ⌘1 .. ⌘9 — nav destinations
      const digitMatch = /^[1-9]$/.test(e.key);
      if (digitMatch && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const routes: Record<string, string> = {
          "1": "/home",
          "2": "/sources",
          "3": "/workspace",
          "4": "/dashboard",
          "5": "/history",
          "6": "/templates",
          "7": "/metrics",
          "8": "/audit",
          "9": "/settings",
        };
        const to = routes[e.key];
        if (to) nav(to);
        return;
      }

      // ⌘N — new analysis (fresh conversation)
      if (e.key.toLowerCase() === "n" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        // Navigate to workspace WITHOUT a conversation id — the workspace
        // generates a fresh one on mount.
        nav("/workspace");
        return;
      }

      // ⌘I — toggle inspector
      if (e.key.toLowerCase() === "i" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        toggleInspector();
        return;
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [nav, toggleInspector, closeShortcuts]);
}