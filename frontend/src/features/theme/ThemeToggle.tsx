import { Moon, Sun } from "lucide-react";

import { useTheme } from "./store";

export function ThemeToggle() {
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);

  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      data-tour="theme"
      onClick={toggle}
      className="flex items-center justify-center w-8 h-8 rounded-[10px] border text-muted hover:text-txt hover:bg-white/5 transition-colors cursor-pointer focusable"
      style={{ borderColor: "var(--aida-border)" }}
      title={label}
      aria-label={label}
    >
      {isDark ? (
        <Sun size={14} strokeWidth={2} />
      ) : (
        <Moon size={14} strokeWidth={2} />
      )}
    </button>
  );
}