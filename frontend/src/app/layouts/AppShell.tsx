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
