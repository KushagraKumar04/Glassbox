/**
 * Canonical list of every keyboard shortcut.
 *
 * The actual keydown handler lives in `useGlobalShortcuts.ts`. This file
 * is the single source of truth for the reference modal — the modal
 * renders directly from `SHORTCUT_GROUPS`.
 *
 * `combo` uses our normalized notation:
 *   - `mod` → ⌘ on Mac, Ctrl elsewhere
 *   - `shift` / `alt` → optional modifiers
 *   - final key → any single character
 */

export type ShortcutCombo = string;

export interface Shortcut {
  /** Display-friendly key string, e.g. "⌘1" or "Ctrl+Shift+N". */
  keys: string;
  /** Normalized combo used by the handler. */
  combo: ShortcutCombo;
  label: string;
}

export interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: "mod+1", combo: "mod+1", label: "Go to Home" },
      { keys: "mod+2", combo: "mod+2", label: "Go to Data Sources" },
      { keys: "mod+3", combo: "mod+3", label: "Go to Workspace" },
      { keys: "mod+4", combo: "mod+4", label: "Go to Dashboard" },
      { keys: "mod+5", combo: "mod+5", label: "Go to History" },
      { keys: "mod+6", combo: "mod+6", label: "Go to Templates" },
      { keys: "mod+7", combo: "mod+7", label: "Go to Metrics" },
      { keys: "mod+8", combo: "mod+8", label: "Go to Audit Log" },
      { keys: "mod+9", combo: "mod+9", label: "Go to Settings" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { keys: "mod+N", combo: "mod+n", label: "Start a new analysis" },
      { keys: "mod+I", combo: "mod+i", label: "Toggle inspector panel" },
      { keys: "mod+K", combo: "mod+k", label: "Open command palette" },
      { keys: "mod+/", combo: "mod+/", label: "Show this shortcuts reference" },
    ],
  },
  {
    title: "In the composer",
    shortcuts: [
      { keys: "↵", combo: "enter", label: "Submit question" },
      { keys: "⇧↵", combo: "shift+enter", label: "New line" },
      { keys: "↑↓", combo: "updown", label: "Navigate history dropdown" },
      { keys: "esc", combo: "esc", label: "Close history dropdown" },
    ],
  },
  {
    title: "In SQL / Python editors",
    shortcuts: [
      { keys: "mod+↵", combo: "mod+enter", label: "Run query" },
      { keys: "mod+Z", combo: "mod+z", label: "Undo" },
      { keys: "mod+⇧Z", combo: "mod+shift+z", label: "Redo" },
      { keys: "mod+F", combo: "mod+f", label: "Find in editor" },
    ],
  },
];

/** Platform-aware display for the "mod" key. */
export function displayKey(keys: string): string {
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform || "");
  const mod = isMac ? "⌘" : "Ctrl";
  return keys.replace(/mod/g, mod);
}