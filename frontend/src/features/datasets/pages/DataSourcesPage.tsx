import { useQuery } from "@tanstack/react-query";
import { Database, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";

import { sourcesApi, type DataSource } from "@/features/sources/api";
import { ConnectionWizard } from "@/features/sources/components/ConnectionWizard";
import { SourceCard } from "@/features/sources/components/SourceCard";

import { datasetsApi, type Dataset } from "../api";
import { DatasetCard } from "../components/DatasetCard";
import { UploadDropzone } from "../components/UploadDropzone";

export function DataSourcesPage() {
  const [wizardOpen, setWizardOpen] = useState(false);

  const datasets = useQuery<Dataset[]>({
    queryKey: ["datasets"],
    queryFn: datasetsApi.list,
  });

  const sources = useQuery<DataSource[]>({
    queryKey: ["sources"],
    queryFn: sourcesApi.list,
  });

  const refetchAll = () => {
    void datasets.refetch();
    void sources.refetch();
  };

  const isFetching = datasets.isFetching || sources.isFetching;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1100px] mx-auto px-6 pt-8 pb-12">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-mono text-[20px] font-semibold tracking-tight">
              Data Sources
            </h2>
            <p className="text-muted text-[13px] mt-1 max-w-[600px]">
              Upload files or connect live databases. Every source is
              read-only from this app's perspective.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={refetchAll}
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
              onClick={() => setWizardOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] text-[12.5px] font-semibold cursor-pointer focusable"
              style={{
                background: "linear-gradient(180deg,#8B5CF6,#6D28D9)",
                color: "#fff",
                boxShadow: "0 0 24px -6px rgba(139,92,246,.5)",
              }}
            >
              <Plus size={13} strokeWidth={2.5} />
              Connect source
            </button>
          </div>
        </div>

        {/* File uploads */}
        <div className="mb-10">
          <UploadDropzone />
        </div>

        {/* Databases */}
        <SectionHeader
          icon={<Database size={11} strokeWidth={2} />}
          label="Connected databases"
          count={sources.data?.length ?? 0}
        />
        {sources.isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-10">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="shimmer rounded-xl h-[148px]"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : sources.data && sources.data.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-10">
            {sources.data.map((s) => (
              <SourceCard key={s.id} source={s} />
            ))}
          </div>
        ) : (
          <div className="glass rounded-xl p-8 text-center mb-10">
            <div className="text-muted text-[13px] mb-1">
              No databases connected
            </div>
            <div className="text-muted/70 text-[12px] mb-4">
              Connect Postgres, MySQL, or a local SQLite file.
            </div>
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="btn-chip focusable cursor-pointer mx-auto"
            >
              <Plus size={11} strokeWidth={2} />
              Connect source
            </button>
          </div>
        )}

        {/* Uploaded files */}
        <SectionHeader label="Uploaded files" count={datasets.data?.length ?? 0} />
        {datasets.isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="shimmer rounded-xl h-[148px]"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : datasets.data && datasets.data.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {datasets.data.map((d) => (
              <DatasetCard key={d.id} dataset={d} />
            ))}
          </div>
        ) : (
          <div className="glass rounded-xl p-8 text-center">
            <div className="text-muted text-[13px]">
              No files uploaded. Drop a file above.
            </div>
          </div>
        )}
      </div>

      <ConnectionWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}

function SectionHeader({
  icon,
  label,
  count,
}: {
  icon?: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted/70">
        {label}
        {count > 0 && ` · ${count}`}
      </div>
    </div>
  );
}