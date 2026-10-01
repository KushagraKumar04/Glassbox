import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Search, Sigma } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/shared/utils/cn";

import { metricsApi, type Metric } from "../api";
import { MetricCard } from "../components/MetricCard";
import { MetricEditor } from "../components/MetricEditor";

type Filter = "all" | "builtin" | "custom";

export function MetricsPage() {
  const qc = useQueryClient();

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Metric | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery<Metric[]>({
    queryKey: ["metrics"],
    queryFn: metricsApi.list,
  });

  const filtered = useMemo(() => {
    let list = data ?? [];
    if (filter === "builtin") list = list.filter((m) => m.is_builtin);
    if (filter === "custom") list = list.filter((m) => !m.is_builtin);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.sql_expression.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q) ||
          m.synonyms.some((s) => s.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [data, filter, search]);

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (m: Metric) => {
    setEditing(m);
    setEditorOpen(true);
  };

  const remove = async (m: Metric) => {
    await metricsApi.remove(m.id);
    qc.invalidateQueries({ queryKey: ["metrics"] });
  };

  const builtinCount = (data ?? []).filter((m) => m.is_builtin).length;
  const customCount = (data ?? []).length - builtinCount;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1100px] mx-auto px-6 pt-8 pb-12">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-mono text-[20px] font-semibold tracking-tight">
              Metrics
            </h2>
            <p className="text-muted text-[13px] mt-1 max-w-[620px]">
              The business glossary for your workspace. When you ask a
              question, the agent uses these definitions to interpret terms
              like "revenue" or "margin".
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="btn-chip focusable cursor-pointer"
            >
              <RefreshCw
                size={11}
                strokeWidth={2}
                className={isFetching ? "animate-spin" : ""}
              />
              Refresh
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] text-[12.5px] font-semibold cursor-pointer focusable"
              style={{
                background: "linear-gradient(180deg,#22D3EE,#0EA5C4)",
                color: "#04121A",
                boxShadow: "0 0 24px -6px rgba(34,211,238,.55)",
              }}
            >
              <Plus size={13} strokeWidth={2.5} />
              New metric
            </button>
          </div>
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <div
            className="flex gap-1 p-1 rounded-xl"
            style={{ background: "var(--aida-code-bg)" }}
          >
            {(
              [
                ["all", `All (${(data ?? []).length})`],
                ["builtin", `Built-in (${builtinCount})`],
                ["custom", `Custom (${customCount})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer focusable transition-colors",
                  filter === id
                    ? "bg-cyan/15 text-cyan"
                    : "text-muted hover:text-txt",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] border flex-1 min-w-[220px] max-w-[360px]"
            style={{ borderColor: "rgba(148,163,184,.16)" }}
          >
            <Search size={12} strokeWidth={2} className="text-muted flex-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search metrics…"
              className="flex-1 bg-transparent outline-none text-[12.5px] placeholder:text-muted/55"
            />
          </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="shimmer rounded-2xl h-[220px]"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((m) => (
              <MetricCard
                key={m.id}
                metric={m}
                onEdit={!m.is_builtin ? () => openEdit(m) : undefined}
                onDelete={!m.is_builtin ? () => void remove(m) : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="glass rounded-2xl p-12 text-center">
            <Sigma
              size={28}
              className="text-muted/40 mx-auto mb-3"
              strokeWidth={1.8}
            />
            <div className="text-muted text-[13px] mb-2">
              {search
                ? "No metrics match your search."
                : filter === "custom"
                  ? "You haven't defined any custom metrics yet."
                  : "No metrics found."}
            </div>
            {!search && filter !== "builtin" && (
              <button
                type="button"
                onClick={openCreate}
                className="btn-chip focusable cursor-pointer mx-auto mt-4"
              >
                <Plus size={11} strokeWidth={2} />
                Define your first metric
              </button>
            )}
          </div>
        )}
      </div>

      <MetricEditor
        open={editorOpen}
        metric={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["metrics"] })}
      />
    </div>
  );
}