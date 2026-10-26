import { create } from "zustand";

interface ShortcutsState {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
}

export const useShortcuts = create<ShortcutsState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));