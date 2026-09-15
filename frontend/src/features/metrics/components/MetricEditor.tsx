import { Loader2, Save, X } from "lucide-react";
import { useEffect, useState } from "react";

import { metricsApi, type Metric, type MetricIn } from "../api";

interface Props {
  open: boolean;
  metric: Metric | null;      // null → create; non-null → edit
  onClose: () => void;
  onSaved: () => void;
}

export function MetricEditor({ open, metric, onClose, onSaved }: Props) {
  const editing = metric !== null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sqlExpression, setSqlExpression] = useState("");
  const [synonymsInput, setSynonymsInput] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (metric) {
      setName(metric.name);
      setDescription(metric.description);
      setSqlExpression(metric.sql_expression);
      setSynonymsInput(metric.synonyms.join(", "));
      setCategory(metric.category);
    } else {
      setName("");
      setDescription("");
      setSqlExpression("");
      setSynonymsInput("");
      setCategory("");
    }
    setError(null);
    setBusy(false);
  }, [open, metric]);

  if (!open) return null;

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError("Name is required.");

    const payload: MetricIn = {
      name: name.trim(),
      description: description.trim(),
      sql_expression: sqlExpression.trim(),
      synonyms: synonymsInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      category: category.trim(),
    };

    setBusy(true);
    try {
      if (editing && metric) {
        await metricsApi.update(metric.id, payload);
      } else {
        await metricsApi.create(payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
      style={{ background: "rgba(3,7,18,.7)", backdropFilter: "blur(6px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="glass-strong rounded-2xl w-[620px] max-w-full overflow-hidden fade-up"
        style={{ boxShadow: "0 30px 80px -12px rgba(0,0,0,.8)" }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "rgba(148,163,184,.16)" }}
        >
          <div className="font-mono text-[13px] font-semibold">
            {editing ? "Edit metric" : "New metric"}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-txt transition-colors cursor-pointer focusable p-1"
            aria-label="Close"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <Field label="Name" hint="the canonical term">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Revenue"
              className="input"
              disabled={busy}
              maxLength={120}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" hint="optional">
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Financial"
                className="input"
                disabled={busy}
                maxLength={64}
              />
            </Field>

            <Field label="Synonyms" hint="comma-separated">
              <input
                value={synonymsInput}
                onChange={(e) => setSynonymsInput(e.target.value)}
                placeholder="sales, turnover"
                className="input font-mono text-[12px]"
                disabled={busy}
              />
            </Field>
          </div>

          <Field label="Description" hint="what the term means">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Total monetary value received from sales."
              className="input resize-none"
              rows={3}
              disabled={busy}
              maxLength={1000}
            />
          </Field>

          <Field
            label="SQL expression"
            hint="optional — suggested structure for the LLM"
          >
            <textarea
              value={sqlExpression}
              onChange={(e) => setSqlExpression(e.target.value)}
              placeholder="SUM(amount) — apply to the correct revenue column"
              className="input font-mono text-[12px] resize-none"
              rows={2}
              disabled={busy}
              maxLength={1000}
            />
          </Field>

          {error && (
            <div
              className="rounded-lg p-3 text-[12px]"
              style={{
                background: "rgba(248,113,113,.08)",
                border: "1px solid rgba(248,113,113,.3)",
                color: "#F87171",
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-2 px-5 py-4 border-t"
          style={{ borderColor: "rgba(148,163,184,.16)" }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3.5 py-2 rounded-[10px] border text-[12.5px] cursor-pointer focusable disabled:opacity-50"
            style={{ borderColor: "rgba(148,163,184,.16)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] text-[12.5px] font-semibold cursor-pointer focusable disabled:opacity-50"
            style={{
              background: "linear-gradient(180deg,#22D3EE,#0EA5C4)",
              color: "#04121A",
            }}
          >
            {busy ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save size={12} strokeWidth={2.5} />
                {editing ? "Save changes" : "Create metric"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

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