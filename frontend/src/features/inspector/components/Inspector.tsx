import { Code2, FileCode2, ListTree, ShieldAlert, Sigma, X } from "lucide-react";

import { cn } from "@/shared/utils/cn";

import { useInspector, type InspectorTab } from "../store";
import { AssumptionsPanel } from "./AssumptionsPanel";
import { DaxPanel } from "./DaxPanel";
import { PythonPanel } from "./PythonPanel";
import { SqlPanel } from "./SqlPanel";
import { TracePanel } from "./TracePanel";

const TABS: {
  id: InspectorTab;
  label: string;
  Icon: typeof Code2;
}[] = [
  { id: "sql", label: "SQL", Icon: Code2 },
  { id: "python", label: "Python", Icon: FileCode2 },
  { id: "dax", label: "DAX", Icon: Sigma },
  { id: "trace", label: "Trace", Icon: ListTree },
  { id: "assumptions", label: "Assumptions", Icon: ShieldAlert },
];

export function Inspector() {
  const { open, tab, setTab, setOpen, artifacts, runId } = useInspector();

  if (!open) return null;

  return (
    <aside
      className="w-[400px] flex-none flex flex-col border-l overflow-hidden"
      style={{
        borderColor: "var(--aida-border)",
        background: "var(--aida-surface)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <div
        className="px-4 pt-4 pb-3 border-b flex-none"
        style={{ borderColor: "var(--aida-border)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted">
            Inspector
          </div>
          <div className="flex items-center gap-2">
            {runId && (
              <span
                className="chip"
                style={{
                  borderColor: "rgba(34,211,238,.3)",
                  color: "#22D3EE",
                }}
              >
                {runId}
              </span>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted hover:text-txt transition-colors cursor-pointer focusable p-1"
              title="Collapse inspector"
              aria-label="Collapse inspector"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="flex gap-1 flex-wrap">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg",
                "font-mono text-[11.5px] cursor-pointer transition-colors focusable",
                tab === id
                  ? "bg-cyan/10 text-cyan"
                  : "text-muted hover:text-txt hover:bg-white/5",
              )}
            >
              <Icon size={11} strokeWidth={2} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "sql" && <SqlPanel artifacts={artifacts} />}
        {tab === "python" && <PythonPanel artifacts={artifacts} />}
        {tab === "dax" && <DaxPanel artifacts={artifacts} />}
        {tab === "trace" && <TracePanel artifacts={artifacts} />}
        {tab === "assumptions" && <AssumptionsPanel artifacts={artifacts} />}
      </div>
    </aside>
  );
}