/**
 * Applies the current theme to <html data-theme> and keeps it in sync
 * with the store + system preference.
 *
 * The inline script in index.html has already set the attribute before
 * React mounts, so this is purely for keeping things consistent during
 * the session.
 */
import { useEffect } from "react";

import { useTheme } from "./store";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme((s) => s.theme);

  // Sync the DOM attribute whenever the store changes
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Listen to system preference changes when the user hasn't picked a theme
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const stored = (() => {
      try {
        return localStorage.getItem("glassbox.theme");
      } catch {
        return null;
      }
    })();

    // Only auto-switch if the user hasn't explicitly chosen a theme
    if (stored === null && typeof window.matchMedia === "function") {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      const handler = (e: MediaQueryListEvent) => {
        const next = e.matches ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        useTheme.setState({ theme: next });
      };
      if (mq.addEventListener) {
        mq.addEventListener("change", handler);
        unlisten = () => mq.removeEventListener("change", handler);
      } else if (mq.addListener) {
        // Safari < 14
        mq.addListener(handler);
        unlisten = () => mq.removeListener(handler);
      }
    }

    return () => unlisten?.();
  }, []);

  return <>{children}</>;
}