import { useQuery } from "@tanstack/react-query";
import { Filter, Plus, X } from "lucide-react";
import { useState } from "react";

import { cn } from "@/shared/utils/cn";

import { filtersApi } from "../api";
import { describeFilter, type ColumnInfo, type FilterCondition } from "../types";
import { FilterEditor } from "./FilterEditor";

interface Props {
  filters: FilterCondition[];
  onChange: (filters: FilterCondition[]) => void;
  datasetIds: string[];
  disabled?: boolean;
}

export function FilterBar({
  filters,
  onChange,
  datasetIds,
  disabled,
}: Props) {
  const [editing, setEditing] = useState<FilterCondition | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const { data: columns = [] } = useQuery<ColumnInfo[]>({
    queryKey: ["filter-columns", datasetIds],
    queryFn: () => filtersApi.columns(datasetIds),
    staleTime: 60_000,
  });

  const openCreate = () => {
    setEditing(null);
    setEditingIndex(null);
    setEditorOpen(true);
  };

  const openEdit = (f: FilterCondition, i: number) => {
    setEditing(f);
    setEditingIndex(i);
    setEditorOpen(true);
  };

  const save = (f: FilterCondition) => {
    if (editingIndex !== null) {
      const next = [...filters];
      next[editingIndex] = f;
      onChange(next);
    } else {
      onChange([...filters, f]);
    }
  };

  const remove = (i: number) => {
    onChange(filters.filter((_, idx) => idx !== i));
  };

  const clearAll = () => {
    onChange([]);
  };

  const hasColumns = columns.length > 0;

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-2 flex-wrap px-5 py-2 border-t",
          !hasColumns && "hidden",
        )}
        style={{ borderColor: "rgba(148,163,184,.12)" }}
      >
        {/* Icon label */}
        <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wider text-muted/70 flex-none">
          <Filter size={11} strokeWidth={2} />
          Filters
        </span>

        {/* Active filter chips */}
        {filters.map((f, i) => (
          <button
            key={i}
            type="button"
            onClick={() => openEdit(f, i)}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-[11px] cursor-pointer focusable transition-colors hover:brightness-110 disabled:opacity-60"
            style={{
              background: "rgba(34,211,238,.10)",
              border: "1px solid rgba(34,211,238,.3)",
              color: "#22D3EE",
            }}
            title="Click to edit"
          >
            <span className="truncate max-w-[260px]">
              {describeFilter(f)}
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                remove(i);
              }}
              className="opacity-60 hover:opacity-100 cursor-pointer"
              role="button"
              aria-label="Remove filter"
            >
              <X size={10} strokeWidth={3} />
            </span>
          </button>
        ))}

        {/* Add button */}
        <button
          type="button"
          onClick={openCreate}
          disabled={disabled || !hasColumns}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-[11px] cursor-pointer focusable transition-colors hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            border: "1px dashed rgba(148,163,184,.3)",
            color: "#AAB6CC",
          }}
        >
          <Plus size={10} strokeWidth={2.5} />
          {filters.length === 0 ? "Add filter" : "Add"}
        </button>

        {filters.length > 1 && (
          <button
            type="button"
            onClick={clearAll}
            disabled={disabled}
            className="ml-auto font-mono text-[10.5px] text-muted/70 hover:text-err cursor-pointer focusable"
          >
            clear all
          </button>
        )}
      </div>

      <FilterEditor
        open={editorOpen}
        columns={columns}
        editing={editing}
        onSave={save}
        onClose={() => setEditorOpen(false)}
      />
    </>
  );
}