import { PanelRightOpen } from "lucide-react";

import { useInspector } from "../store";

export function InspectorToggle() {
  const { open, toggle } = useInspector();
  if (open) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-[10px] border text-[12px] text-muted hover:text-txt hover:bg-white/5 transition-colors cursor-pointer focusable"
      style={{ borderColor: "rgba(148,163,184,.16)" }}
      title="Show inspector"
    >
      <PanelRightOpen size={13} strokeWidth={2} />
      <span className="font-mono text-[11px] hidden sm:inline">Inspector</span>
    </button>
  );
}