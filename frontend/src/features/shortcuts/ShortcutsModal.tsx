import { Keyboard, X } from "lucide-react";
import { useEffect } from "react";

import { displayKey, SHORTCUT_GROUPS } from "./registry";
import { useShortcuts } from "./store";

export function ShortcutsModal() {
  const { open, setOpen } = useShortcuts();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center pt-[10vh] px-4"
      style={{ background: "rgba(3,7,18,.65)", backdropFilter: "blur(6px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        className="glass-strong rounded-2xl w-[680px] max-w-full overflow-hidden fade-up flex flex-col"
        style={{
          boxShadow: "0 30px 90px -12px rgba(0,0,0,.85)",
          maxHeight: "80vh",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3.5 border-b flex-none"
          style={{ borderColor: "var(--aida-border)" }}
        >
          <Keyboard size={16} className="text-cyan flex-none" strokeWidth={2} />
          <div className="min-w-0">
            <div className="font-mono text-[13px] font-semibold">
              Keyboard shortcuts
            </div>
            <div className="font-mono text-[10.5px] text-muted">
              Works everywhere in the app
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ml-auto text-muted hover:text-txt cursor-pointer focusable p-1"
            aria-label="Close"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6">
            {SHORTCUT_GROUPS.map((group) => (
              <div key={group.title}>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted/70 mb-2.5">
                  {group.title}
                </div>
                <div className="space-y-0.5">
                  {group.shortcuts.map((s) => (
                    <div
                      key={s.combo}
                      className="flex items-center gap-3 py-1.5 rounded-md px-1"
                    >
                      <kbd
                        className="font-mono text-[11px] px-2 py-1 rounded-md flex-none min-w-[64px] text-center"
                        style={{
                          background: "var(--aida-code-bg)",
                          border: "1px solid var(--aida-border)",
                          color: "var(--aida-txt)",
                        }}
                      >
                        {displayKey(s.keys)}
                      </kbd>
                      <span className="text-[12.5px] text-muted truncate">
                        {s.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-3 px-5 py-3 border-t flex-none font-mono text-[10.5px] text-muted/70"
          style={{ borderColor: "var(--aida-border)" }}
        >
          <span>
            Press{" "}
            <kbd
              className="px-1.5 py-0.5 rounded text-[10px]"
              style={{
                background: "var(--aida-code-bg)",
                border: "1px solid var(--aida-border)",
              }}
            >
              esc
            </kbd>{" "}
            to close
          </span>
          <span className="ml-auto">
            <span style={{ color: "#22D3EE" }}>mod</span> = ⌘ on macOS, Ctrl
            elsewhere
          </span>
        </div>
      </div>
    </div>
  );
}