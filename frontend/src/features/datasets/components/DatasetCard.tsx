import { useQueryClient } from "@tanstack/react-query";
import { Table2, Trash2 } from "lucide-react";
import { useState } from "react";

import { datasetsApi, type Dataset } from "../api";
import { ColumnModal } from "./ColumnModal";

const MAX_VISIBLE_COLS = 4;

export function DatasetCard({ dataset }: { dataset: Dataset }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openColumn, setOpenColumn] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    try {
      await datasetsApi.remove(dataset.id);
      qc.invalidateQueries({ queryKey: ["datasets"] });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const cols = dataset.profile.columns ?? [];
  const visible = cols.slice(0, MAX_VISIBLE_COLS);
  const extra = cols.length - visible.length;

  return (
    <>
      <div className="glass rounded-xl p-4 flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between mb-3 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-lg grid place-items-center flex-none"
              style={{
                background: "rgba(148,163,184,.08)",
                border: "1px solid var(--aida-border)",
              }}
              aria-hidden="true"
            >
              <Table2 size={14} className="text-muted" strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-medium truncate">
                {dataset.name}
              </div>
              <div className="font-mono text-[10.5px] text-muted truncate">
                {dataset.table_name}
              </div>
            </div>
          </div>

          {confirming ? (
            <div className="flex gap-1 flex-none">
              <button
                type="button"
                onClick={() => void remove()}
                disabled={busy}
                className="px-2 py-1 rounded-md text-[11px] cursor-pointer focusable"
                style={{
                  background: "rgba(248,113,113,.15)",
                  color: "#F87171",
                  border: "1px solid rgba(248,113,113,.3)",
                }}
              >
                {busy ? "…" : "Delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-2 py-1 rounded-md text-[11px] cursor-pointer text-muted focusable"
                style={{ border: "1px solid var(--aida-border)" }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-muted hover:text-[#F87171] transition-colors focusable cursor-pointer p-1 flex-none"
              title="Delete dataset"
            >
              <Trash2 size={14} strokeWidth={1.8} />
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-3.5 font-mono text-[10.5px]">
          <div>
            <div className="text-muted/60">rows</div>
            <div className="text-txt/85 mt-0.5">
              {dataset.row_count.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-muted/60">cols</div>
            <div className="text-txt/85 mt-0.5">{dataset.column_count}</div>
          </div>
          <div>
            <div className="text-muted/60">type</div>
            <div className="mt-0.5" style={{ color: "#34D399" }}>
              {dataset.file_type}
            </div>
          </div>
        </div>

        {/* Column chips — now clickable */}
        <div className="flex flex-wrap gap-1 mt-auto">
          {visible.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => setOpenColumn(c.name)}
              className="font-mono text-[10px] px-1.5 py-0.5 rounded border cursor-pointer transition-colors focusable hover:brightness-125"
              style={{
                borderColor: "var(--aida-border)",
                color: "var(--aida-muted)",
                background: "transparent",
              }}
              title={`${c.name}: ${c.type} — click for stats`}
            >
              {c.name}
            </button>
          ))}
          {extra > 0 && (
            <span className="font-mono text-[10px] text-muted self-center">
              +{extra}
            </span>
          )}
        </div>
      </div>

      <ColumnModal
        open={openColumn !== null}
        datasetId={dataset.id}
        datasetName={dataset.name}
        column={openColumn}
        onClose={() => setOpenColumn(null)}
      />
    </>
  );
}