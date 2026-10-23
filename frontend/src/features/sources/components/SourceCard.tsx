import { useQueryClient } from "@tanstack/react-query";
import { Database, RefreshCw, Server, Trash2 } from "lucide-react";
import { useState } from "react";

import { sourcesApi, type DataSource } from "../api";

const KIND_LABEL: Record<string, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL",
  sqlite: "SQLite",
};

export function SourceCard({ source }: { source: DataSource }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await sourcesApi.remove(source.id);
      qc.invalidateQueries({ queryKey: ["sources"] });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await sourcesApi.refresh(source.id);
      qc.invalidateQueries({ queryKey: ["sources"] });
    } finally {
      setRefreshing(false);
    }
  };

  const healthColor =
    source.status === "healthy"
      ? "#34D399"
      : source.status === "error"
        ? "#F87171"
        : "#FBBF24";

  return (
    <div className="glass rounded-xl p-4 flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-lg grid place-items-center flex-none"
            style={{
              background: "rgba(139,92,246,.12)",
              border: "1px solid rgba(139,92,246,.25)",
            }}
            aria-hidden="true"
          >
            <Server size={14} className="text-violet" strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-medium truncate">
              {source.name}
            </div>
            <div className="font-mono text-[10.5px] text-muted truncate">
              {KIND_LABEL[source.kind] ?? source.kind}
              {source.host ? ` · ${source.host}` : ""}
            </div>
          </div>
        </div>
        <span
          className="w-2 h-2 rounded-full flex-none mt-1"
          style={{ background: healthColor }}
          title={source.status}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3.5 font-mono text-[10.5px]">
        <div>
          <div className="text-muted/60">database</div>
          <div className="text-txt/85 mt-0.5 truncate">
            {source.database || "—"}
          </div>
        </div>
        <div>
          <div className="text-muted/60">tables</div>
          <div className="text-txt/85 mt-0.5">{source.table_count}</div>
        </div>
        <div>
          <div className="text-muted/60">status</div>
          <div className="mt-0.5" style={{ color: healthColor }}>
            {source.status}
          </div>
        </div>
      </div>

