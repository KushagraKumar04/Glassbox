import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { cn } from "@/shared/utils/cn";

import { templatesApi, type Template } from "../api";
import { TemplateCard } from "../components/TemplateCard";
import { TemplateEditor } from "../components/TemplateEditor";

type Filter = "all" | "builtin" | "personal";

export function TemplatesPage() {
  const nav = useNavigate();
  const qc = useQueryClient();

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery<Template[]>({
    queryKey: ["templates"],
    queryFn: templatesApi.list,
  });

  const filtered = useMemo(() => {
    let list = data ?? [];
    if (filter === "builtin") list = list.filter((t) => t.is_builtin);
    if (filter === "personal") list = list.filter((t) => !t.is_builtin);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.question.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [data, filter, search]);

  const useTemplate = async (t: Template) => {
    // Fire-and-forget usage counter — don't block navigation
    void templatesApi.use(t.id).catch(() => {});
    nav(`/workspace?q=${encodeURIComponent(t.question)}`);
  };

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (t: Template) => {
    setEditing(t);
    setEditorOpen(true);
  };

  const remove = async (t: Template) => {
    await templatesApi.remove(t.id);
    qc.invalidateQueries({ queryKey: ["templates"] });
  };

  const builtinCount = (data ?? []).filter((t) => t.is_builtin).length;
  const personalCount = (data ?? []).length - builtinCount;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1100px] mx-auto px-6 pt-8 pb-12">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-mono text-[20px] font-semibold tracking-tight">
              Templates
            </h2>
            <p className="text-muted text-[13px] mt-1 max-w-[560px]">
              Reusable analysis playbooks. Click a template to run it against
              your data, or save your own.
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
              New template
            </button>
          </div>
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--aida-code-bg)" }}>
            {(
              [
                ["all", `All (${(data ?? []).length})`],
                ["builtin", `Built-in (${builtinCount})`],
                ["personal", `Mine (${personalCount})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer focusable transition-colors",
                  filter === id ? "bg-cyan/15 text-cyan" : "text-muted hover:text-txt",
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
              placeholder="Search templates…"
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
                className="shimmer rounded-2xl h-[240px]"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onUse={() => void useTemplate(t)}
                onEdit={!t.is_builtin ? () => openEdit(t) : undefined}
                onDelete={!t.is_builtin ? () => void remove(t) : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="glass rounded-2xl p-12 text-center">
            <div className="text-muted text-[13px] mb-2">
              {search
                ? "No templates match your search."
                : filter === "personal"
                  ? "You haven't created any templates yet."
                  : "No templates found."}
            </div>
            {!search && filter !== "builtin" && (
              <button
                type="button"
                onClick={openCreate}
                className="btn-chip focusable cursor-pointer mx-auto mt-4"
              >
                <Plus size={11} strokeWidth={2} />
                Create your first template
              </button>
            )}
          </div>
        )}
      </div>

      <TemplateEditor
        open={editorOpen}
        template={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["templates"] })}
      />
    </div>
  );
}