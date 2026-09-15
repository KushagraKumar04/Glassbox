/**
 * Compact "From your templates" strip for the Home page.
 *
 * Shows the 3 most-used templates. Renders nothing if:
 *   - no templates exist
 *   - no template has been used yet (usage_count === 0)
 *
 * This keeps Home clean for new users while rewarding repeat users with
 * their own playbooks.
 */
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Layers } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { templatesApi, type Template } from "../api";

const _MAX_SHOWN = 3;

export function TemplateSuggestions() {
  const nav = useNavigate();

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["templates"],
    queryFn: templatesApi.list,
    staleTime: 60_000,
  });

  const top = useMemo(() => {
    return [...templates]
      .filter((t) => (t.usage_count ?? 0) > 0)
      .sort((a, b) => b.usage_count - a.usage_count)
      .slice(0, _MAX_SHOWN);
  }, [templates]);

  if (top.length === 0) return null;

  const use = (t: Template) => {
    void templatesApi.use(t.id).catch(() => {});
    nav(`/workspace?q=${encodeURIComponent(t.question)}`);
  };

  return (
    <div className="mb-10">
      <div className="flex items-center gap-2 mb-3">
        <Layers size={12} className="text-violet" strokeWidth={2} />
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted/70">
          From your templates
        </div>
        <button
          type="button"
          onClick={() => nav("/templates")}
          className="font-mono text-[10.5px] text-muted/60 hover:text-cyan cursor-pointer focusable ml-auto"
        >
          view all →
        </button>
      </div>

      <div className="grid sm:grid-cols-3 gap-2.5">
        {top.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => use(t)}
            className="glass rounded-xl p-3.5 text-left cursor-pointer transition-colors hover:brightness-110 focusable flex flex-col group"
          >
            <div className="flex items-start gap-2.5 mb-2">
              <Layers
                size={13}
                className="text-violet flex-none mt-0.5"
                strokeWidth={2}
                aria-hidden="true"
              />
              <span className="text-[13px] font-medium leading-snug">
                {t.name}
              </span>
            </div>

            {t.description && (
              <span className="text-[11.5px] text-muted leading-relaxed line-clamp-2 mb-3">
                {t.description}
              </span>
            )}

            <span className="flex items-center justify-between mt-auto pt-1">
              <span className="font-mono text-[10px] text-muted/70">
                used {t.usage_count}×
              </span>
              <ArrowRight
                size={12}
                className="text-muted/50 group-hover:text-cyan transition-colors"
                strokeWidth={2}
              />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}