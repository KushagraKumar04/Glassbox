import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CircleAlert,
  Database,
  Loader2,
  Server,
  X,
} from "lucide-react";
import { useState } from "react";

import { cn } from "@/shared/utils/cn";

import { sourcesApi, type SourceKind, type SourceTestResult } from "../api";

interface Props {
  open: boolean;
  onClose: () => void;
}

const KIND_INFO: Record<
  SourceKind,
  { label: string; defaultPort: number; hint: string }
> = {
  postgres: {
    label: "PostgreSQL",
    defaultPort: 5432,
    hint: "Works with Postgres, Aurora PG, Azure Database for PostgreSQL, and Redshift (PG-compatible).",
  },
  mysql: {
    label: "MySQL / MariaDB",
    defaultPort: 3306,
    hint: "Works with MySQL, MariaDB, and Aurora MySQL.",
  },
  sqlite: {
    label: "SQLite",
    defaultPort: 0,
    hint: "Point to a local .db / .sqlite file on the server.",
  },
};

type Step = "kind" | "credentials" | "testing" | "saved";

export function ConnectionWizard({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("kind");
  const [kind, setKind] = useState<SourceKind>("postgres");
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(5432);
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [sslMode, setSslMode] = useState("prefer");
  const [testResult, setTestResult] = useState<SourceTestResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const reset = () => {
    setStep("kind");
    setKind("postgres");
    setName("");
    setHost("");
    setPort(5432);
    setDatabase("");
    setUsername("");
    setPassword("");
    setSslMode("prefer");
    setTestResult(null);
    setSaveError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const pickKind = (k: SourceKind) => {
    setKind(k);
    setPort(KIND_INFO[k].defaultPort);
    setStep("credentials");
  };

  const credentials = {
    name: name.trim() || undefined,
    kind,
    host,
    port,
    database,
    username,
    password,
    ssl_mode: sslMode,
  };

  const runTest = async () => {
    setStep("testing");
    setTestResult(null);
    try {
      const r = await sourcesApi.test(credentials);
      setTestResult(r);
      setStep("credentials");
    } catch (e) {
      setTestResult({ ok: false, error: (e as Error).message, tables: [], table_count: 0 });
      setStep("credentials");
    }
  };

  const save = async () => {
    setSaveError(null);
    try {
      await sourcesApi.create({ ...credentials, name: credentials.name ?? "" });
      qc.invalidateQueries({ queryKey: ["sources"] });
      setStep("saved");
    } catch (e) {
      setSaveError((e as Error).message);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
      style={{ background: "rgba(3,7,18,.7)", backdropFilter: "blur(6px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="glass-strong rounded-2xl w-[560px] max-w-full overflow-hidden fade-up"
        style={{ boxShadow: "0 30px 80px -12px rgba(0,0,0,.8)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "rgba(148,163,184,.16)" }}
        >
          <div className="flex items-center gap-2.5">
            <Database size={16} className="text-cyan" strokeWidth={2} />
            <div className="font-mono text-[13px] font-semibold">
              Connect a data source
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="text-muted hover:text-txt transition-colors cursor-pointer focusable p-1"
            aria-label="Close"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {step === "kind" && (
            <div className="space-y-2">
              <div className="text-[12.5px] text-muted mb-3">
                Choose a database type. Connection is tested before saving.
              </div>
              {(Object.keys(KIND_INFO) as SourceKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => pickKind(k)}
                  className="w-full glass rounded-xl p-3.5 text-left cursor-pointer hover:brightness-110 focusable flex items-start gap-3"
                >
                  <div
                    className="w-8 h-8 rounded-lg grid place-items-center flex-none"
                    style={{
                      background: "rgba(34,211,238,.12)",
                      border: "1px solid rgba(34,211,238,.25)",
                    }}
                  >
                    <Server size={14} className="text-cyan" strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium">
                      {KIND_INFO[k].label}
                    </div>
                    <div className="text-[11.5px] text-muted mt-0.5 leading-relaxed">
                      {KIND_INFO[k].hint}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === "credentials" && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setStep("kind")}
                className="font-mono text-[10.5px] text-muted hover:text-cyan cursor-pointer"
              >
                ← {KIND_INFO[kind].label}
              </button>

              <Field label="Display name" hint="How this source appears in lists">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`my-${kind}-prod`}
                  className="input"
                />
              </Field>

              {kind === "sqlite" ? (
                <Field label="Database file path">
                  <input
                    value={database}
                    onChange={(e) => setDatabase(e.target.value)}
                    placeholder="/absolute/path/to/file.db"
                    className="input font-mono"
                  />
                </Field>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <Field label="Host">
                        <input
                          value={host}
                          onChange={(e) => setHost(e.target.value)}
                          placeholder="db.example.com"
                          className="input font-mono"
                        />
                      </Field>
                    </div>
                    <Field label="Port">
                      <input
                        type="number"
                        value={port}
                        onChange={(e) => setPort(Number(e.target.value) || 0)}
                        className="input font-mono"
                      />
                    </Field>
                  </div>

                  <Field label="Database">
                    <input
                      value={database}
                      onChange={(e) => setDatabase(e.target.value)}
                      placeholder="analytics"
                      className="input font-mono"
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Username">
                      <input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="readonly_user"
                        className="input font-mono"
                      />
                    </Field>
                    <Field label="Password">
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="input font-mono"
                      />
                    </Field>
                  </div>

                  {kind === "postgres" && (
                    <Field label="SSL mode">
                      <select
                        value={sslMode}
                        onChange={(e) => setSslMode(e.target.value)}
                        className="input font-mono"
                      >
                        <option value="disable">disable</option>
                        <option value="prefer">prefer</option>
                        <option value="require">require</option>
                        <option value="verify-ca">verify-ca</option>
                        <option value="verify-full">verify-full</option>
                      </select>
                    </Field>
                  )}
                </>
              )}

              {testResult && (
                <div
                  className="rounded-xl p-3 text-[12px] leading-relaxed"
                  style={{
                    background: testResult.ok
                      ? "rgba(52,211,153,.08)"
                      : "rgba(248,113,113,.08)",
                    border: testResult.ok
                      ? "1px solid rgba(52,211,153,.3)"
                      : "1px solid rgba(248,113,113,.3)",
                    color: testResult.ok ? "#34D399" : "#F87171",
                  }}
                >
                  <div className="flex items-start gap-2">
                    {testResult.ok ? (
                      <Check size={14} strokeWidth={3} className="mt-0.5 flex-none" />
                    ) : (
                      <CircleAlert size={14} strokeWidth={3} className="mt-0.5 flex-none" />
                    )}
                    <div className="min-w-0">
                      <div className="font-medium">
                        {testResult.ok
                          ? `Connected · ${testResult.table_count} table${testResult.table_count === 1 ? "" : "s"}`
                          : "Connection failed"}
                      </div>
                      {!testResult.ok && testResult.error && (
                        <div className="font-mono text-[10.5px] mt-1 break-all opacity-90">
                          {testResult.error}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {saveError && (
                <div
                  className="rounded-xl p-3 text-[12px]"
                  style={{
                    background: "rgba(248,113,113,.08)",
                    border: "1px solid rgba(248,113,113,.3)",
                    color: "#F87171",
                  }}
                >
                  {saveError}
                </div>
              )}
            </div>
          )}

          {step === "testing" && (
            <div className="py-10 text-center">
              <Loader2
                size={28}
                className="animate-spin text-cyan mx-auto"
                strokeWidth={2}
              />
              <div className="mt-3 text-[13px] text-muted">
                Testing connection…
              </div>
            </div>
          )}

          {step === "saved" && (
            <div className="py-10 text-center">
              <Check
                size={32}
                className="text-ok mx-auto"
                strokeWidth={2.5}
              />
              <div className="mt-3 text-[14px] font-medium">Source saved</div>
              <div className="mt-1 text-[12.5px] text-muted">
                {name || KIND_INFO[kind].label} is ready to query.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === "credentials" || step === "testing") && (
          <div
            className="flex items-center justify-end gap-2 px-5 py-4 border-t"
            style={{ borderColor: "rgba(148,163,184,.16)" }}
          >
            <button
              type="button"
              onClick={close}
              className="px-3.5 py-2 rounded-[10px] border text-[12.5px] cursor-pointer focusable"
              style={{ borderColor: "rgba(148,163,184,.16)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={runTest}
              disabled={step === "testing"}
              className="px-3.5 py-2 rounded-[10px] border text-[12.5px] cursor-pointer focusable disabled:opacity-50"
              style={{ borderColor: "rgba(34,211,238,.4)", color: "#22D3EE" }}
            >
              Test connection
            </button>
            <button
              type="button"
              onClick={save}
              disabled={step === "testing"}
              className={cn(
                "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] text-[12.5px] font-semibold cursor-pointer focusable",
                "disabled:opacity-50",
              )}
              style={{
                background: "linear-gradient(180deg,#22D3EE,#0EA5C4)",
                color: "#04121A",
              }}
            >
              Save source
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Field helper ──────────────────────────────────────── */

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted">
          {label}
        </span>
        {hint && (
          <span className="font-mono text-[10px] text-muted/60">{hint}</span>
        )}
      </div>
      {children}
    </label>
  );
}