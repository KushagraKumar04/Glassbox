import { create } from "zustand";

interface GuestGateState {
  open: boolean;
  /** Optional custom message shown above the CTA. */
  message: string;
  show: (message?: string) => void;
  hide: () => void;
}

export const useGuestGate = create<GuestGateState>((set) => ({
  open: false,
  message: "",
  show: (message) => set({ open: true, message: message ?? "" }),
  hide: () => set({ open: false, message: "" }),
}));