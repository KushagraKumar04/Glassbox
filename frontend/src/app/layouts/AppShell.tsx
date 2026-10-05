import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { GuestBanner } from "@/features/auth/components/GuestBanner";
import { GuestSignInPrompt } from "@/features/auth/components/GuestSignInPrompt";
import { useAuth } from "@/features/auth/store";
import { CommandPalette } from "@/features/command-palette/CommandPalette";
import { Inspector } from "@/features/inspector/components/Inspector";
import { OnboardingTour } from "@/features/onboarding/OnboardingTour";
import { useTour } from "@/features/onboarding/store";
import { ShortcutsModal } from "@/features/shortcuts/ShortcutsModal";
import { useGlobalShortcuts } from "@/features/shortcuts/useGlobalShortcuts";

import { LeftRail } from "./LeftRail";
import { TopBar } from "./TopBar";

export function AppShell() {
  useGlobalShortcuts();

  const location = useLocation();
  const authStatus = useAuth((s) => s.status);
  const tourCompleted = useTour((s) => s.completed);
  const tourActive = useTour((s) => s.active);

  // Auto-start the tour on first visit to /home after auth bootstraps
  useEffect(() => {
    if (authStatus === "bootstrapping") return;
    if (tourCompleted) return;
    if (tourActive) return;
    if (location.pathname !== "/home") return;

    const t = window.setTimeout(() => {
      const s = useTour.getState();
      if (s.active || s.completed) return;
      s.start();
    }, 500);
    return () => window.clearTimeout(t);
  }, [authStatus, tourCompleted, tourActive, location.pathname]);

  return (
    <>
      <div className="relative z-[1] flex h-screen flex-col">
        <GuestBanner />
        <div className="flex-1 flex min-h-0">
          <LeftRail />
          <div className="flex-1 flex flex-col min-w-0">
            <TopBar />
            <div className="flex-1 flex min-h-0">
              <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
                <Outlet />
              </main>
              <Inspector />
            </div>
          </div>
        </div>
      </div>
