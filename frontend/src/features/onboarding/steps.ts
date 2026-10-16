/**
 * Tour step definitions.
 *
 * `target` is a CSS selector pointing at an element that must have a
 * `data-tour="<id>"` attribute on it. When the target is missing, the
 * step renders as a centered card.
 *
 * `placement` is a preference — the actual position is computed from
 * the target's location in the viewport (see `OnboardingTour.tsx`).
 */
export interface TourStep {
  id: string;
  target?: string;
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
}

export const STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Glassbox",
    body:
      "A glass-box AI analyst. Ask your data in plain English — get back the " +
      "answer, the SQL that produced it, and a full execution trace.",
    placement: "center",
  },
  {
    id: "brand",
    target: '[data-tour="brand"]',
    title: "Your workspace",
    body:
      "Everything you do lives in one local workspace. Data never leaves " +
      "the server you're running.",
    placement: "right",
  },
  {
    id: "nav",
    target: '[data-tour="nav"]',
    title: "Navigate the app",
    body:
      "Upload data, ask questions, browse history, define metrics. " +
      "Use ⌘1–9 to jump anywhere instantly.",
    placement: "right",
  },
  {
    id: "palette",
    target: '[data-tour="palette"]',
    title: "⌘K does everything",
    body:
      "Open the command palette to search, navigate, or just type a " +
      "question and run it — all without leaving the keyboard.",
    placement: "bottom",
  },
  {
    id: "theme",
    target: '[data-tour="theme"]',
    title: "Comfort mode",
    body:
      "Flip between dark and light. The app remembers your choice.",
    placement: "bottom",
  },
  {
    id: "hero",
    target: '[data-tour="hero"]',
    title: "Ask your data",
    body:
      "Type a question in plain English. Glassbox picks the columns, " +
      "writes the SQL, runs the Python, and shows you every step.",
    placement: "bottom",
  },
  {
    id: "suggestions",
    target: '[data-tour="suggestions"]',
    title: "Try a starter",
    body:
      "These suggestions are tailored to your uploaded datasets. " +
      "Click one to see a full run in action.",
    placement: "top",
  },
  {
    id: "done",
    title: "You're all set",
    body:
      "Press ⌘/ anytime to see every shortcut. Restart this tour from the " +
      "command palette whenever you want.",
    placement: "center",
  },
];