import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Clock,
  Cpu,
  Database,
  HardDrive,
  Loader2,
  Server,
  User as UserIcon,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { PROVIDER_LABELS } from "@/config/constants";
import { useAuth } from "@/features/auth/store";
import { cn } from "@/shared/utils/cn";

import { systemApi, type SystemInfo } from "../api";

export function SettingsPage() {
  const nav = useNavigate();
  const { data, isLoading, isError, error, refetch } = useQuery<SystemInfo>({
    queryKey: ["system-info"],
    queryFn: systemApi.info,
    staleTime: 15_000,
  });

  if (isLoading) {
    return (
      <div className="flex-1 grid place-items-center text-muted">
        <div className="font-mono text-[12px]">Loading settings…</div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex-1 grid place-items-center text-muted">
        <div className="text-center">
          <div className="text-[13px] mb-2">Could not load settings</div>
          <div className="font-mono text-[11px] text-err mb-4">
            {(error as Error)?.message ?? ""}
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="btn-chip focusable cursor-pointer mx-auto"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[880px] mx-auto px-6 pt-8 pb-12">
        <div className="mb-6">
          <h2 className="font-mono text-[20px] font-semibold tracking-tight">
            Settings
          </h2>
          <p className="text-muted text-[13px] mt-1">
            Account, provider, execution limits, and storage.
          </p>
        </div>

        <Section title="Account" icon={<UserIcon size={13} strokeWidth={2} />}>
          <AccountInfo authEnabled={data.auth.enabled} />
        </Section>

        <Section
          title="LLM Provider"
          icon={<Server size={13} strokeWidth={2} />}
        >
          <Row label="Provider">
            <span className="font-mono text-[12.5px] text-cyan">
              {PROVIDER_LABELS[data.llm.provider] ?? data.llm.provider}
            </span>
          </Row>
          <Row label="Model">
            <span className="font-mono text-[12.5px]">{data.llm.model}</span>
          </Row>
          <Row label="Temperature">
            <span className="font-mono text-[12.5px]">
              {data.llm.temperature}
            </span>
          </Row>
          <Row label="Max output tokens">
            <span className="font-mono text-[12.5px]">
              {data.llm.max_tokens.toLocaleString()}
            </span>
          </Row>
          <div
            className="mt-3 pt-3 text-[11.5px] text-muted"
            style={{ borderTop: "1px solid rgba(148,163,184,.16)" }}
          >
            To swap providers, edit <code className="font-mono">.env</code> and
            restart the backend. No code changes needed.
          </div>
        </Section>

        <Section
          title="Execution limits"
          icon={<Cpu size={13} strokeWidth={2} />}
        >
          <Row label="Max upload size">
            <span className="font-mono text-[12.5px]">
              {data.limits.max_upload_size_mb} MB
            </span>
          </Row>
          <Row label="Max rows per query">
            <span className="font-mono text-[12.5px]">
              {data.limits.max_query_rows.toLocaleString()}
            </span>
          </Row>
          <Row label="Query timeout">
            <span className="font-mono text-[12.5px]">
              {data.limits.query_timeout_seconds}s
            </span>
          </Row>
          <Row label="Sandbox">
            <span
              className="chip"
              style={{
                borderColor: data.limits.sandbox_enabled
                  ? "rgba(52,211,153,.3)"
                  : "rgba(251,191,36,.3)",
                color: data.limits.sandbox_enabled ? "#34D399" : "#FBBF24",
              }}
            >
              {data.limits.sandbox_enabled
                ? `docker · ${data.limits.sandbox_timeout_seconds}s`
                : "local subprocess"}
            </span>
          </Row>
          <Row label="Max concurrent runs">
            <span className="font-mono text-[12.5px]">
              {data.limits.max_concurrent_runs}
            </span>
          </Row>
        </Section>

        <Section
          title="Storage & activity"
          icon={<HardDrive size={13} strokeWidth={2} />}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={<Database size={12} strokeWidth={2} />}
              value={data.stats.datasets}
              label="Datasets"
            />
            <StatCard
              icon={<Server size={12} strokeWidth={2} />}
              value={data.stats.sources}
              label="Sources"
            />
            <StatCard
              icon={<Clock size={12} strokeWidth={2} />}
              value={data.stats.runs}
              label="Runs"
            />
            <StatCard
              icon={<Clock size={12} strokeWidth={2} />}
              value={data.stats.conversations}
              label="Conversations"
            />
          </div>

          <Row label="Uploads on disk" className="mt-3">
            <span className="font-mono text-[12.5px]">
              {formatBytes(data.stats.uploads_bytes)}
            </span>
          </Row>
          <Row label="Artifacts on disk">
            <span className="font-mono text-[12.5px]">
              {formatBytes(data.stats.artifacts_bytes)}
            </span>
          </Row>
        </Section>

        <Section
          title="System"
          icon={<Server size={13} strokeWidth={2} />}
        >
          <Row label="App version">
            <span className="font-mono text-[12.5px]">{data.app.version}</span>
          </Row>
          <Row label="Environment">
            <span className="font-mono text-[12.5px]">{data.app.env}</span>
          </Row>
          <Row label="Display timezone">
            <span className="font-mono text-[12.5px]">
              {data.app.display_timezone}
            </span>
          </Row>
        </Section>

        <DangerZone onChanged={() => nav("/sources")} />
      </div>
    </div>
  );
}

/* ── Account ─────────────────────────────────────────────── */

function AccountInfo({ authEnabled }: { authEnabled: boolean }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  if (!authEnabled) {
    return (
      <div className="text-[12.5px] text-muted leading-relaxed">
        Running in <strong className="text-txt">single-user mode</strong>. No
        login required. Set{" "}
        <code className="font-mono">AUTH_ENABLED=true</code> in{" "}
        <code className="font-mono">.env</code> to enable multi-user accounts.
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex items-start gap-3">
      <div
        className="w-10 h-10 rounded-xl grid place-items-center font-mono text-[13px] font-bold flex-none"
        style={{
          background: "linear-gradient(135deg,#8B5CF6,#22D3EE)",
          color: "#04121A",
        }}
      >
        {(user.username || user.email).replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium">{user.username}</div>
        <div className="font-mono text-[11.5px] text-muted truncate">
          {user.email}
        </div>
        <div className="flex items-center gap-3 mt-2 text-[11.5px] text-muted">
          <span className="flex items-center gap-1">
            <Check size={11} strokeWidth={2.5} className="text-ok" />
            {user.is_active ? "active" : "inactive"}
          </span>
          {user.is_superuser && (
            <span style={{ color: "#22D3EE" }}>superuser</span>
          )}
          <span>
            joined{" "}
            {new Date(user.created_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          logout();
          nav("/login", { replace: true });
        }}
        className="btn-chip focusable cursor-pointer flex-none"
        style={{ color: "#F87171" }}
      >
        Sign out
      </button>
    </div>
  );
}

/* ── Danger zone ─────────────────────────────────────────── */

function DangerZone({ onChanged }: { onChanged: () => void }) {
  const qc = useQueryClient();

  const [confirmRuns, setConfirmRuns] = useState(false);
  const [confirmData, setConfirmData] = useState(false);
  const [busy, setBusy] = useState<"runs" | "data" | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const clearRuns = async () => {
    setBusy("runs");
    try {
      const res = await systemApi.clearRuns();
      setDone(`Deleted ${res.deleted} run${res.deleted === 1 ? "" : "s"}.`);
      qc.invalidateQueries({ queryKey: ["runs"] });
      qc.invalidateQueries({ queryKey: ["system-info"] });
    } finally {
      setBusy(null);
      setConfirmRuns(false);
    }
  };

  const clearDatasets = async () => {
    setBusy("data");
    try {
      const res = await systemApi.clearDatasets();
      setDone(
        `Deleted ${res.deleted} dataset${res.deleted === 1 ? "" : "s"} and their files.`,
      );
      qc.invalidateQueries({ queryKey: ["datasets"] });
      qc.invalidateQueries({ queryKey: ["suggestions"] });
      qc.invalidateQueries({ queryKey: ["system-info"] });
      onChanged();
    } finally {
      setBusy(null);
      setConfirmData(false);
    }
  };

  return (
    <div
      className="rounded-2xl p-5 mt-8"
      style={{
        background: "rgba(248,113,113,.04)",
        border: "1px solid rgba(248,113,113,.25)",
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle
          size={15}
          className="text-err flex-none"
          strokeWidth={2}
        />
        <div className="font-mono text-[12px] uppercase tracking-wider text-err">
          Danger zone
        </div>
      </div>

      <div className="space-y-3">
        {/* Clear runs */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-[13px] font-medium">Clear run history</div>
            <div className="text-[11.5px] text-muted mt-0.5 max-w-[520px]">
              Deletes every run in your history. Datasets and sources stay.
              This cannot be undone.
            </div>
          </div>
          <div className="flex-none">
            {confirmRuns ? (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => void clearRuns()}
                  disabled={busy === "runs"}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] cursor-pointer focusable disabled:opacity-50"
                  style={{
                    background: "rgba(248,113,113,.15)",
                    color: "#F87171",
                    border: "1px solid rgba(248,113,113,.4)",
                  }}
                >
                  {busy === "runs" ? (
                    <>
                      <Loader2 size={10} className="animate-spin" />
                      Deleting…
                    </>
                  ) : (
                    "Yes, delete runs"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRuns(false)}
                  className="btn-chip focusable cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDone(null);
                  setConfirmRuns(true);
                }}
                className="btn-chip focusable cursor-pointer"
                style={{ color: "#F87171", borderColor: "rgba(248,113,113,.3)" }}
              >
                Clear runs
              </button>
            )}
          </div>
        </div>

        <div
          style={{ borderTop: "1px solid rgba(248,113,113,.15)" }}
          className="pt-3"
        />

        {/* Clear datasets */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-[13px] font-medium">
              Delete all datasets
            </div>
            <div className="text-[11.5px] text-muted mt-0.5 max-w-[520px]">
              Removes every uploaded file and its profile. Connected
              databases are not affected. This cannot be undone.
            </div>
          </div>
          <div className="flex-none">
            {confirmData ? (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => void clearDatasets()}
                  disabled={busy === "data"}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] cursor-pointer focusable disabled:opacity-50"
                  style={{
                    background: "rgba(248,113,113,.15)",
                    color: "#F87171",
                    border: "1px solid rgba(248,113,113,.4)",
                  }}
                >
                  {busy === "data" ? (
                    <>
                      <Loader2 size={10} className="animate-spin" />
                      Deleting…
                    </>
                  ) : (
                    "Yes, delete everything"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmData(false)}
                  className="btn-chip focusable cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDone(null);
                  setConfirmData(true);
                }}
                className="btn-chip focusable cursor-pointer"
                style={{ color: "#F87171", borderColor: "rgba(248,113,113,.3)" }}
              >
                Delete datasets
              </button>
            )}
          </div>
        </div>
      </div>

      {done && (
        <div
          className="mt-4 text-[12px] rounded-lg p-2.5 fade-up"
          style={{
            background: "rgba(52,211,153,.08)",
            border: "1px solid rgba(52,211,153,.3)",
            color: "#34D399",
          }}
        >
          {done}
        </div>
      )}
    </div>
  );
}

/* ── Small primitives ────────────────────────────────────── */

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted/70">
          {title}
        </span>
      </div>
      <div className="glass rounded-2xl p-4">{children}</div>
    </section>
  );
}

function Row({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-center justify-between gap-3 py-2", className)}
    >
      <span className="text-[12.5px] text-muted">{label}</span>
      {children}
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div
      className="rounded-xl p-3 text-center"
      style={{
        background: "var(--aida-code-bg)",
        border: "1px solid rgba(148,163,184,.16)",
      }}
    >
      <div className="flex items-center justify-center gap-1.5 text-muted/60 mb-1">
        {icon}
      </div>
      <div className="font-mono text-[19px] font-bold text-cyan">
        {value.toLocaleString()}
      </div>
      <div className="font-mono text-[10px] text-muted mt-0.5">{label}</div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}