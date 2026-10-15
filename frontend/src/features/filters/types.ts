export type FilterOperator =
  | "=" | "!=" | ">" | ">=" | "<" | "<="
  | "in" | "not_in" | "between"
  | "contains" | "not_contains"
  | "is_null" | "is_not_null";

export type ColumnKind = "numeric" | "date" | "boolean" | "text";

export interface FilterCondition {
  column: string;
  operator: FilterOperator;
  value: unknown; // scalar | unknown[] | [lo, hi]
}

export interface ColumnInfo {
  name: string;
  type: string;
  kind: ColumnKind;
  from_datasets: string[];
  distinct_preview: unknown[];
}

/** Operators valid for each column kind. */
export const OPERATORS_BY_KIND: Record<ColumnKind, FilterOperator[]> = {
  numeric: ["=", "!=", ">", ">=", "<", "<=", "between", "is_null", "is_not_null"],
  date: [">=", "<=", "between", "=", "!=", "is_null", "is_not_null"],
  boolean: ["=", "!="],
  text: [
    "=", "!=", "in", "not_in", "contains", "not_contains",
    "is_null", "is_not_null",
  ],
};

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  "=": "equals",
  "!=": "not equals",
  ">": "greater than",
  ">=": "≥",
  "<": "less than",
  "<=": "≤",
  in: "is one of",
  not_in: "is not one of",
  between: "is between",
  contains: "contains",
  not_contains: "does not contain",
  is_null: "is empty",
  is_not_null: "is not empty",
};

export function describeFilter(f: FilterCondition): string {
  const label = OPERATOR_LABELS[f.operator] ?? f.operator;
  if (f.operator === "is_null" || f.operator === "is_not_null") {
    return `${f.column} ${label}`;
  }
  if (f.operator === "between") {
    const v = Array.isArray(f.value) ? f.value : ["", ""];
    return `${f.column} ${v[0]} → ${v[1]}`;
  }
  if (Array.isArray(f.value)) {
    return `${f.column} ${label} ${f.value.join(", ")}`;
  }
  return `${f.column} ${label} ${String(f.value ?? "")}`;
}