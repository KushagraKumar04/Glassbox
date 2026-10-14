import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/shared/utils/cn";

import {
  OPERATORS_BY_KIND,
  OPERATOR_LABELS,
  type ColumnInfo,
  type FilterCondition,
  type FilterOperator,
} from "../types";

interface Props {
  open: boolean;
  columns: ColumnInfo[];
  /** When editing, the filter being modified. When null, creating. */
  editing: FilterCondition | null;
  onSave: (f: FilterCondition) => void;
  onClose: () => void;
}

export function FilterEditor({
  open,
  columns,
  editing,
  onSave,
  onClose,
}: Props) {
  const [column, setColumn] = useState<string>("");
  const [operator, setOperator] = useState<FilterOperator>("=");
  const [value, setValue] = useState<string>("");
  const [rangeLo, setRangeLo] = useState<string>("");
  const [rangeHi, setRangeHi] = useState<string>("");
  const [inList, setInList] = useState<string[]>([]);
  const [inDraft, setInDraft] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setColumn(editing.column);
      setOperator(editing.operator);
      if (editing.operator === "between" && Array.isArray(editing.value)) {
        setRangeLo(String(editing.value[0] ?? ""));
        setRangeHi(String(editing.value[1] ?? ""));
      } else if (
        (editing.operator === "in" || editing.operator === "not_in") &&
        Array.isArray(editing.value)
      ) {
        setInList(editing.value.map((v) => String(v)));
      } else if (
        editing.operator !== "is_null" &&
        editing.operator !== "is_not_null"
      ) {
        setValue(String(editing.value ?? ""));
      }
    } else {
      setColumn(columns[0]?.name ?? "");
      setOperator(columns[0] ? defaultOperator(columns[0].kind) : "=");
      setValue("");
      setRangeLo("");
      setRangeHi("");
      setInList([]);
      setInDraft("");
    }
  }, [open, editing, columns]);

  if (!open) return null;

  const selectedColumn = columns.find((c) => c.name === column);
  const availableOps = selectedColumn
    ? OPERATORS_BY_KIND[selectedColumn.kind]
    : [];

  const onColumnChange = (name: string) => {
    setColumn(name);
    const col = columns.find((c) => c.name === name);
    if (col) {
      const ops = OPERATORS_BY_KIND[col.kind];
      if (!ops.includes(operator)) {
        setOperator(ops[0]);
      }
    }
  };

  const buildValue = (): unknown => {
    if (operator === "is_null" || operator === "is_not_null") return null;
    if (operator === "between") return [rangeLo, rangeHi];
    if (operator === "in" || operator === "not_in") return inList;
    if (selectedColumn?.kind === "numeric") {
      const n = Number(value);
      return Number.isFinite(n) ? n : value;
    }
    if (selectedColumn?.kind === "boolean") {
      return value === "true";
    }
    return value;
  };

  const canSave = (): boolean => {
    if (!column) return false;
    if (operator === "is_null" || operator === "is_not_null") return true;
    if (operator === "between") return !!rangeLo && !!rangeHi;
    if (operator === "in" || operator === "not_in") return inList.length > 0;
    return value.trim().length > 0;
  };

  const save = () => {
    if (!canSave()) return;
    onSave({ column, operator, value: buildValue() });
    onClose();
  };

  const addToInList = () => {
    const v = inDraft.trim();
    if (!v || inList.includes(v)) return;
    setInList((prev) => [...prev, v]);
    setInDraft("");
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
      style={{ background: "rgba(3,7,18,.65)", backdropFilter: "blur(6px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="glass-strong rounded-2xl w-[480px] max-w-full overflow-hidden fade-up"
        style={{ boxShadow: "0 30px 80px -12px rgba(0,0,0,.85)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "rgba(148,163,184,.16)" }}
        >
          <div className="font-mono text-[13px] font-semibold">
            {editing ? "Edit filter" : "Add filter"}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-txt cursor-pointer focusable p-1"
            aria-label="Close"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Column */}
          <Field label="Column">
            <select
              value={column}
              onChange={(e) => onColumnChange(e.target.value)}
              className="input font-mono text-[12.5px]"
            >
              {columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} · {c.kind}
                </option>
              ))}
            </select>
          </Field>

          {/* Operator */}
          <Field label="Condition">
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value as FilterOperator)}
              className="input font-mono text-[12.5px]"
            >
              {availableOps.map((op) => (
                <option key={op} value={op}>
                  {OPERATOR_LABELS[op]}
                </option>
              ))}
            </select>
          </Field>

          {/* Value — varies by operator and kind */}
          {operator !== "is_null" && operator !== "is_not_null" && (
            <Field label="Value">
              {operator === "between" ? (
                <div className="flex items-center gap-2">
                  <input
                    type={selectedColumn?.kind === "date" ? "date" : "text"}
                    value={rangeLo}
                    onChange={(e) => setRangeLo(e.target.value)}
                    onClick={openPicker}
                    onFocus={openPicker}
                    placeholder="from"
                    className="input font-mono text-[12.5px]"
                    style={{ cursor: "pointer" }}
                  />
                  <span className="text-muted text-[12px]">→</span>
                  <input
                    type={selectedColumn?.kind === "date" ? "date" : "text"}
                    value={rangeHi}
                    onChange={(e) => setRangeHi(e.target.value)}
                    onClick={openPicker}
                    onFocus={openPicker}
                    placeholder="to"
                    className="input font-mono text-[12.5px]"
                    style={{ cursor: "pointer" }}
                  />
                </div>
              ) : operator === "in" || operator === "not_in" ? (
                <div>
                  <div className="flex gap-2 mb-2">
                    <input
                      value={inDraft}
                      onChange={(e) => setInDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addToInList();
                        }
                      }}
                      placeholder="type a value + Enter"
                      className="input font-mono text-[12.5px] flex-1"
                      list={`filter-values-${column}`}
                    />
                    <button
                      type="button"
                      onClick={addToInList}
                      disabled={!inDraft.trim()}
                      className="px-3 rounded-[10px] border text-[12px] cursor-pointer focusable disabled:opacity-40"
                      style={{
                        borderColor: "rgba(34,211,238,.4)",
                        color: "#22D3EE",
                      }}
                    >
                      Add
                    </button>
                  </div>
                  {selectedColumn?.distinct_preview &&
                    selectedColumn.distinct_preview.length > 0 && (
                      <datalist id={`filter-values-${column}`}>
                        {selectedColumn.distinct_preview.map((v, i) => (
                          <option key={i} value={String(v)} />
                        ))}
                      </datalist>
                    )}
                  {inList.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {inList.map((v) => (
                        <span
                          key={v}
                          className="font-mono text-[11px] px-2 py-0.5 rounded-md inline-flex items-center gap-1.5"
                          style={{
                            background: "rgba(34,211,238,.12)",
                            color: "#22D3EE",
                            border: "1px solid rgba(34,211,238,.3)",
                          }}
                        >
                          {v}
                          <button
                            type="button"
                            onClick={() =>
                              setInList((prev) => prev.filter((x) => x !== v))
                            }
                            className="cursor-pointer"
                            aria-label={`Remove ${v}`}
                          >
                            <X size={10} strokeWidth={3} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : selectedColumn?.kind === "boolean" ? (
                <select
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="input font-mono text-[12.5px]"
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  type={
                    selectedColumn?.kind === "date"
                      ? "date"
                      : selectedColumn?.kind === "numeric"
                        ? "number"
                        : "text"
                  }
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onClick={
                    selectedColumn?.kind === "date" ? openPicker : undefined
                  }
                  onFocus={
                    selectedColumn?.kind === "date" ? openPicker : undefined
                  }
                  placeholder={placeholderFor(selectedColumn)}
                  className="input font-mono text-[12.5px]"
                  style={
                    selectedColumn?.kind === "date"
                      ? { cursor: "pointer" }
                      : undefined
                  }
                  list={
                    selectedColumn?.kind === "text"
                      ? `filter-values-${column}`
                      : undefined
                  }
                />
              )}
            </Field>
          )}

          {/* Hint */}
          {selectedColumn && (
            <div className="text-[11.5px] text-muted leading-relaxed">
              Applies to every selected table that has{" "}
              <code className="font-mono text-cyan">{selectedColumn.name}</code>
              {selectedColumn.from_datasets.length > 1 && (
                <> across {selectedColumn.from_datasets.length} datasets</>
              )}
              . Rows not matching are invisible to the agent.
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
            className="px-3.5 py-2 rounded-[10px] border text-[12.5px] cursor-pointer focusable"
            style={{ borderColor: "rgba(148,163,184,.16)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave()}
            className={cn(
              "px-3.5 py-2 rounded-[10px] text-[12.5px] font-semibold cursor-pointer focusable disabled:opacity-40",
            )}
            style={{
              background: "linear-gradient(180deg,#22D3EE,#0EA5C4)",
              color: "#04121A",
            }}
          >
            {editing ? "Save changes" : "Add filter"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Primitives ──────────────────────────────────────────── */

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}

function defaultOperator(kind: string): FilterOperator {
  if (kind === "date") return "between";
  if (kind === "text") return "in";
  return "=";
}

/**
 * Open the native date picker when the whole field is clicked.
 *
 * Chrome/Edge/Safari support `showPicker()`. Firefox falls back to
 * `focus()` + the native behavior of `<input type="date">`.
 */
function openPicker(
  e: React.FocusEvent<HTMLInputElement> | React.MouseEvent<HTMLInputElement>
) {
  const el = e.currentTarget;
  if (el.type !== "date") return;

  // Guard against double-fire from onClick + onFocus on the same element
  if (document.activeElement === el && el.dataset.pickerOpen === "1") return;
  el.dataset.pickerOpen = "1";
  window.setTimeout(() => {
    delete el.dataset.pickerOpen;
  }, 250);

  if (typeof el.showPicker === "function") {
    try {
      el.showPicker();
      return;
    } catch {
      // Some browsers throw if called during a non-user gesture.
      // Fall through to focus() — the user can click the icon.
    }
  }

  el.focus();
}

function placeholderFor(col?: ColumnInfo): string {
  if (!col) return "";
  if (col.kind === "numeric") return "42";
  if (col.kind === "date") return "2024-01-01";
  if (col.kind === "text") return "APAC";
  return "";
}