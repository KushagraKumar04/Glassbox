import { Loader2, Save, X } from "lucide-react";
import { useEffect, useState } from "react";

import { templatesApi, type Template, type TemplateIn } from "../api";

interface Props {
  open: boolean;
  template: Template | null;   // null → create; non-null → edit
  onClose: () => void;
  onSaved: () => void;
}

export function TemplateEditor({ open, template, onClose, onSaved }: Props) {
  const editing = template !== null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [question, setQuestion] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when the modal opens
  useEffect(() => {
    if (!open) return;
    if (template) {
      setName(template.name);
      setDescription(template.description);
      setQuestion(template.question);
      setTagsInput(template.tags.join(", "));
    } else {
      setName("");
      setDescription("");
      setQuestion("");
      setTagsInput("");
    }
    setError(null);
    setBusy(false);
  }, [open, template]);

  if (!open) return null;

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    if (question.trim().length < 3) {
      return setError("Question must be at least 3 characters.");
    }

    const payload: TemplateIn = {
      name: name.trim(),
      description: description.trim(),
      question: question.trim(),
      tags: tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };

    setBusy(true);
    try {
      if (editing && template) {
        await templatesApi.update(template.id, payload);
      } else {
        await templatesApi.create(payload);
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
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "rgba(148,163,184,.16)" }}
        >
          <div className="font-mono text-[13px] font-semibold">
            {editing ? "Edit template" : "New template"}
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

        {/* Body */}
        <div className="p-5 space-y-4">
          <Field label="Name" hint="shown on the card">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Q2 revenue drivers"
              className="input"
              disabled={busy}
              maxLength={120}
            />
          </Field>

          <Field label="Description" hint="optional, one line">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this template is for"
              className="input"
              disabled={busy}
              maxLength={500}
            />
          </Field>

          <Field label="Question" hint="the prompt sent to the agent">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Break down revenue by region and highlight the largest declines."
              className="input resize-none"
              rows={4}
              disabled={busy}
              maxLength={2000}
            />
          </Field>

          <Field label="Tags" hint="comma-separated, max 8">
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="revenue, diagnostics, time-series"
              className="input font-mono text-[12px]"
              disabled={busy}
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

        {/* Footer */}
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
                {editing ? "Save changes" : "Create template"}
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