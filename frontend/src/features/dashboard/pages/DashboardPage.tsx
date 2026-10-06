import { useMutation, useQuery } from "@tanstack/react-query";
import { LayoutDashboard, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";

import { DatasetPicker } from "@/features/datasets/components/DatasetPicker";
import { SourcePicker } from "@/features/sources/components/SourcePicker";
import { datasetsApi } from "@/features/datasets/api";
import { sourcesApi } from "@/features/sources/api";

import {
  dashboardApi,
  type DashboardPanelData,
  type DashboardResponse,
} from "../api";
import { DashboardPanel } from "../components/DashboardPanel";

export function DashboardPage() {
  const [datasetIds, setDatasetIds] = useState<string[]>([]);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [result, setResult] = useState<DashboardResponse | null>(null);

  // Preload pickers so users see what's available
  useQuery({ queryKey: ["datasets"], queryFn: datasetsApi.list });
  useQuery({ queryKey: ["sources"], queryFn: sourcesApi.list });

  const generate = useMutation({
    mutationFn: () =>
      dashboardApi.generate({
        dataset_ids: datasetIds,
        source_ids: sourceIds,
        filters: [],
        max_panels: 8,
      }),
    onSuccess: (data) => setResult(data),
  });

  const hasPanels = (result?.panels?.length ?? 0) > 0;
  const isGenerating = generate.isPending;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1400px] mx-auto px-6 pt-8 pb-12">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-mono text-[20px] font-semibold tracking-tight flex items-center gap-2">
              <LayoutDashboard size={18} className="text-cyan" strokeWidth={2} />
              Dashboard
            </h2>
            <p className="text-muted text-[13px] mt-1 max-w-[620px]">
              One-click dashboard from your datasets. Panels are chosen by
              deterministic rules — no LLM. Click any panel header action to
              ask a follow-up in the workspace.
            </p>
          </div>

          <button
            type="button"
            onClick={() => generate.mutate()}
            disabled={isGenerating}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] text-[12.5px] font-semibold cursor-pointer focusable disabled:opacity-50"
            style={{
              background: "linear-gradient(180deg,#22D3EE,#0EA5C4)",
              color: "#04121A",
              boxShadow: "0 0 24px -6px rgba(34,211,238,.55)",
            }}
          >
            {isGenerating ? (
              <>
                <RefreshCw size={13} className="animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles size={13} strokeWidth={2.5} />
                {hasPanels ? "Regenerate" : "Generate dashboard"}
              </>
            )}
          </button>
        </div>

        {/* Dataset scope */}
        <div
          className="glass rounded-2xl p-3.5 mb-6 flex items-center gap-2 flex-wrap relative z-10"
        >
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted/70">
            Scope
          </span>
          <DatasetPicker
            selectedIds={datasetIds}
            onChange={setDatasetIds}
            dropDirection="down"
          />
          <SourcePicker
            selectedIds={sourceIds}
            onChange={setSourceIds}
            dropDirection="down"
          />
          <span className="font-mono text-[10.5px] text-muted ml-auto">
            {datasetIds.length === 0 && sourceIds.length === 0
              ? "using all datasets & sources"
              : `${datasetIds.length + sourceIds.length} selected`}
          </span>
        </div>

        {/* Result */}
        {!result && !isGenerating && (
          <EmptyState />
        )}

        {isGenerating && !result && (
          <SkeletonGrid />
        )}

        {result && !hasPanels && !isGenerating && (
          <EmptyResult />
        )}

        {result && hasPanels && (
          <>
            <div className="flex items-center gap-3 mb-4 font-mono text-[10.5px] text-muted">
              <span>
                {result.panels.length} panel
                {result.panels.length === 1 ? "" : "s"}
              </span>
              <span>·</span>
              <span>{(result.elapsed_ms / 1000).toFixed(1)}s</span>
              <span>·</span>
              <span>
                {result.dataset_count} dataset
                {result.dataset_count === 1 ? "" : "s"}
              </span>
            </div>
            <DashboardGrid panels={result.panels} />
          </>
        )}
      </div>
    </div>
  );
}

/* ── Grid ─────────────────────────────────────────────── */

function DashboardGrid({ panels }: { panels: DashboardPanelData[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {panels.map((p) => (
        <div
          key={p.id}
          className={
            p.kind === "table"
              ? "md:col-span-2 lg:col-span-3"
              : p.kind === "kpi"
                ? ""
                : "md:col-span-1 lg:col-span-1"
          }
        >
          <DashboardPanel panel={p} />
        </div>
      ))}
    </div>
  );
}

/* ── Empty states ─────────────────────────────────────── */

function EmptyState() {
  return (
    <div className="glass rounded-2xl p-16 text-center">
      <LayoutDashboard
        size={32}
        className="text-muted/40 mx-auto mb-4"
        strokeWidth={1.8}
      />
      <div className="text-[14px] font-medium mb-2">
        No dashboard yet
      </div>
      <div className="text-[12.5px] text-muted max-w-[420px] mx-auto leading-relaxed">
        Click <strong className="text-txt">Generate dashboard</strong> to
        auto-build a grid of KPI cards, trends, comparisons, and a sample
        table from your data.
      </div>
    </div>
  );
}

function EmptyResult() {
  return (
    <div className="glass rounded-2xl p-12 text-center">
      <div className="text-[13px] text-muted mb-1">
        No panels generated
      </div>
      <div className="text-[12px] text-muted/70">
        Make sure your datasets have at least one row and at least one
        numeric or text column.
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="shimmer rounded-2xl h-[200px]"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}