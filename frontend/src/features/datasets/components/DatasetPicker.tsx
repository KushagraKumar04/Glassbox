import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Database } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/shared/utils/cn";

import { datasetsApi, type Dataset } from "../api";

interface Props {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Which way the dropdown opens. Default "up" (matches composer usage). */
  dropDirection?: "up" | "down";
}

export function DatasetPicker({
  selectedIds,
  onChange,
  dropDirection = "up",
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: datasets = [] } = useQuery<Dataset[]>({
    queryKey: ["datasets"],
    queryFn: datasetsApi.list,
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );
  };

  const allSelected = selectedIds.length === 0;
  const label = allSelected
    ? "all datasets"
    : `${selectedIds.length} dataset${selectedIds.length === 1 ? "" : "s"}`;

  const dropdownPosition =
    dropDirection === "up" ? "bottom-full mb-2" : "top-full mt-2";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="chip cursor-pointer hover:brightness-125 focusable"
        title="Choose which datasets to query"
      >
        <Database size={10} strokeWidth={2} />
        scope: {label}
        <ChevronDown size={9} strokeWidth={2.5} />
      </button>

      {open && (
        <div
          className={cn(
            "glass-strong rounded-xl absolute left-0 w-[280px] max-h-[320px] overflow-y-auto p-1.5 fade-up z-[150]",
            dropdownPosition,
          )}
          style={{ boxShadow: "0 20px 50px -10px rgba(0,0,0,.7)" }}
        >
          {datasets.length === 0 ? (
            <div className="px-3 py-4 text-[12px] text-muted text-center">
              No datasets uploaded.
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  onChange([]);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12.5px] cursor-pointer focusable",
                  "hover:bg-white/5",
                  allSelected && "bg-cyan/10 text-cyan",
                )}
              >
                <span
                  className="w-3.5 h-3.5 rounded border grid place-items-center flex-none"
                  style={{
                    borderColor: allSelected
                      ? "#22D3EE"
                      : "rgba(148,163,184,.35)",
                    background: allSelected ? "#22D3EE" : "transparent",
                  }}
                >
                  {allSelected && (
                    <Check size={9} className="text-[#04121A]" strokeWidth={4} />
                  )}
                </span>
                <span className="font-medium">All datasets</span>
              </button>

              <div
                className="my-1 border-t"
                style={{ borderColor: "rgba(148,163,184,.16)" }}
              />

              {datasets.map((d) => {
                const checked = selectedIds.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggle(d.id)}
                    className={cn(
                      "w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left cursor-pointer focusable",
                      "hover:bg-white/5",
                    )}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded border grid place-items-center flex-none mt-0.5"
                      style={{
                        borderColor: checked
                          ? "#22D3EE"
                          : "rgba(148,163,184,.35)",
                        background: checked ? "#22D3EE" : "transparent",
                      }}
                    >
                      {checked && (
                        <Check
                          size={9}
                          className="text-[#04121A]"
                          strokeWidth={4}
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-[12.5px] block truncate">
                        {d.name}
                      </span>
                      <span className="font-mono text-[10px] text-muted block truncate">
                        {d.row_count.toLocaleString()} rows ·{" "}
                        {d.column_count} cols
                      </span>
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}