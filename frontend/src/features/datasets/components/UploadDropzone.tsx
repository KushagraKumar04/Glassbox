import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Loader2,
  RotateCcw,
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/shared/utils/cn";

import { datasetsApi, type Dataset } from "../api";

// ── Constants ────────────────────────────────────────────────

const ACCEPT =
  ".csv,.tsv,.xlsx,.xls,.parquet,.json,.jsonl";

const ACCEPT_EXTENSIONS = [
  ".csv", ".tsv", ".xlsx", ".xls", ".parquet", ".json", ".jsonl",
];

const MAX_SIZE_MB = 100;
const CONCURRENCY = 3;

// ── Types ────────────────────────────────────────────────────

type FileStatus = "queued" | "uploading" | "done" | "error";

interface QueuedFile {
  id: string;
  file: File;
  status: FileStatus;
  error?: string;
  result?: Dataset;
}

// ── Helpers ─────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function validateFile(file: File): string | null {
  const lower = file.name.toLowerCase();
  if (!ACCEPT_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return `Unsupported file type. Allowed: ${ACCEPT_EXTENSIONS.join(", ")}`;
  }
  if (file.size / 1_048_576 > MAX_SIZE_MB) {
    return `File exceeds ${MAX_SIZE_MB} MB`;
  }
  if (file.size === 0) {
    return "File is empty";
  }
  return null;
}

// ── Component ────────────────────────────────────────────────

export function UploadDropzone() {
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  // ── Enqueue ──────────────────────────────────────────────
  const enqueue = (incoming: File[]) => {
    const next: QueuedFile[] = incoming.map((file) => {
      const invalid = validateFile(file);
      return {
        id: uid(),
        file,
        status: invalid ? "error" : "queued",
        error: invalid ?? undefined,
      };
    });
    setFiles((prev) => [...prev, ...next]);
  };

  // ── Upload one file ──────────────────────────────────────
  const uploadOne = async (q: QueuedFile) => {
    try {
      const ds = await datasetsApi.upload(q.file);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === q.id ? { ...f, status: "done", result: ds } : f,
        ),
      );
      qc.invalidateQueries({ queryKey: ["datasets"] });
    } catch (e) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === q.id
            ? { ...f, status: "error", error: (e as Error).message }
            : f,
        ),
      );
    }
  };

  // ── Concurrency manager ──────────────────────────────────
  //
  // Fires whenever the queue changes. Starts up to CONCURRENCY uploads
  // at a time. When one finishes, the state changes and the effect runs
  // again, freeing a slot for the next queued file.
  useEffect(() => {
    const uploading = files.filter((f) => f.status === "uploading").length;
    const slots = Math.max(0, CONCURRENCY - uploading);
    if (slots === 0) return;

    const pending = files.filter((f) => f.status === "queued");
    if (pending.length === 0) return;

    const toStart = pending.slice(0, slots);

    // Mark uploading immediately so the effect can't re-select them
    const ids = new Set(toStart.map((f) => f.id));
    setFiles((prev) =>
      prev.map((f) =>
        ids.has(f.id) ? { ...f, status: "uploading" } : f,
      ),
    );

    toStart.forEach((f) => {
      void uploadOne({ ...f, status: "uploading" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  // ── Handlers ─────────────────────────────────────────────

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files ?? []);
    if (dropped.length > 0) enqueue(dropped);
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length > 0) enqueue(picked);
    e.target.value = "";
  };

  const retry = (id: string) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, status: "queued", error: undefined } : f,
      ),
    );
  };

  const retryAllFailed = () => {
    setFiles((prev) =>
      prev.map((f) =>
        f.status === "error" && !f.error?.startsWith("Unsupported") &&
        !f.error?.startsWith("File exceeds") &&
        !f.error?.startsWith("File is empty")
          ? { ...f, status: "queued", error: undefined }
          : f,
      ),
    );
  };

  const clearCompleted = () => {
    setFiles((prev) => prev.filter((f) => f.status !== "done"));
  };

  const removeItem = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // ── Derived ──────────────────────────────────────────────

  const total = files.length;
  const done = files.filter((f) => f.status === "done").length;
  const failed = files.filter((f) => f.status === "error").length;
  const inFlight = files.filter(
    (f) => f.status === "uploading" || f.status === "queued",
  ).length;

  const allComplete = total > 0 && inFlight === 0;

  // Auto-hide the queue panel 4s after everything succeeds
  useEffect(() => {
    if (!allComplete) return;
    if (failed > 0) return;
    const t = window.setTimeout(() => {
      setFiles((prev) => prev.filter((f) => f.status !== "done"));
    }, 4000);
    return () => window.clearTimeout(t);
  }, [allComplete, failed]);

  const showQueue = total > 0;

  return (
    <div className="space-y-3">
      {/* ── Dropzone ──────────────────────────────────── */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            input.current?.click();
          }
        }}
        className={cn(
          "glass rounded-2xl p-8 text-center cursor-pointer transition-all focusable",
        )}
        style={{
          borderColor: dragging ? "rgba(34,211,238,.5)" : undefined,
          background: dragging ? "rgba(34,211,238,.06)" : undefined,
        }}
      >
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={onPick}
        />

        <UploadCloud
          className="mx-auto text-cyan"
          size={28}
          strokeWidth={2}
        />

        <div className="mt-3 text-[13.5px] font-medium">
          Drop files or click to upload
        </div>
        <div className="mt-1 font-mono text-[10.5px] text-muted">
          CSV · TSV · XLSX · Parquet · JSON
        </div>
        <div className="mt-2 font-mono text-[10.5px] text-muted/60">
          Drop multiple files — uploads run {CONCURRENCY} at a time
        </div>
      </div>

      {/* ── Queue ─────────────────────────────────────── */}
      {showQueue && (
        <div className="glass rounded-2xl overflow-hidden fade-up">
          {/* Header */}
          <div
            className="flex items-center gap-2 px-4 py-2.5 border-b flex-wrap"
            style={{ borderColor: "var(--aida-border)" }}
          >
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted">
              Upload queue
            </span>
            <span className="font-mono text-[10.5px] text-muted/70">
              {done + failed} of {total} complete
            </span>
            {failed > 0 && (
              <span
                className="chip"
                style={{
                  borderColor: "rgba(248,113,113,.3)",
                  color: "#F87171",
                }}
              >
                {failed} failed
              </span>
            )}

            <div className="ml-auto flex items-center gap-1.5">
              {failed > 0 && (
                <button
                  type="button"
                  onClick={retryAllFailed}
                  className="btn-chip focusable cursor-pointer"
                >
                  <RotateCcw size={10} strokeWidth={2} />
                  Retry all
                </button>
              )}
              {done > 0 && (
                <button
                  type="button"
                  onClick={clearCompleted}
                  className="btn-chip focusable cursor-pointer"
                >
                  Clear done
                </button>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {inFlight > 0 && (
            <div
              className="h-0.5"
              style={{ background: "rgba(148,163,184,.12)" }}
            >
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${(done / total) * 100}%`,
                  background: "linear-gradient(90deg,#22D3EE,#8B5CF6)",
                }}
              />
            </div>
          )}

          {/* Items */}
          <div className="max-h-[320px] overflow-y-auto">
            {files.map((f) => (
              <FileRow
                key={f.id}
                item={f}
                onRetry={() => retry(f.id)}
                onRemove={() => removeItem(f.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── File row ───────────────────────────────────────────── */

function FileRow({
  item,
  onRetry,
  onRemove,
}: {
  item: QueuedFile;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const { status, file, error, result } = item;

  const statusIcon = (() => {
    if (status === "queued") {
      return (
        <span
          className="w-4 h-4 rounded-full grid place-items-center flex-none"
          style={{
            border: "1.5px solid rgba(148,163,184,.35)",
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "rgba(148,163,184,.6)" }}
          />
        </span>
      );
    }
    if (status === "uploading") {
      return (
        <Loader2
          size={14}
          className="text-cyan animate-spin flex-none"
          strokeWidth={2}
        />
      );
    }
    if (status === "done") {
      return (
        <span
          className="w-4 h-4 rounded-full grid place-items-center flex-none"
          style={{
            background: "#22D3EE",
            border: "1.5px solid #22D3EE",
          }}
        >
          <Check size={9} className="text-[#04121A]" strokeWidth={4} />
        </span>
      );
    }
    return (
      <AlertTriangle
        size={14}
        className="text-err flex-none"
        strokeWidth={2.2}
      />
    );
  })();

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 group"
      style={{ borderBottom: "1px solid var(--aida-border)" }}
    >
      {statusIcon}

      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium truncate">
          {file.name}
        </div>
        <div className="font-mono text-[10.5px] text-muted truncate mt-0.5">
          {status === "queued" && "Queued"}
          {status === "uploading" && "Profiling…"}
          {status === "done" && result && (
            <>
              {result.row_count.toLocaleString()} rows ·{" "}
              {result.column_count} cols
            </>
          )}
          {status === "error" && (error || "Upload failed")}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-none opacity-0 group-hover:opacity-100 transition-opacity">
        {status === "error" && (
          <button
            type="button"
            onClick={onRetry}
            className="text-muted hover:text-cyan transition-colors cursor-pointer focusable p-1"
            title="Retry"
          >
            <RotateCcw size={12} strokeWidth={2} />
          </button>
        )}
        {status !== "uploading" && (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted hover:text-err transition-colors cursor-pointer focusable p-1"
            title="Remove from list"
          >
            <X size={12} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}