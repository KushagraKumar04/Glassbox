/**
 * SQL formatter — wraps sql-formatter with our defaults.
 *
 * Defaults chosen for readability in a narrow inspector panel (400px wide):
 *   - uppercase keywords (SELECT, FROM, WHERE)
 *   - one clause per line
 *   - 2-space indent
 *   - no tabs
 *   - keep lines under ~60 chars when possible
 */
import { format, type FormatOptionsWithLanguage } from "sql-formatter";

const DEFAULTS: FormatOptionsWithLanguage = {
  language: "sql",       // dialect — sql-formatter handles DuckDB well enough
  keywordCase: "upper",
  identifierCase: "preserve",
  dataTypeCase: "upper",
  functionCase: "upper",
  indentStyle: "standard",   // expands to 2 spaces
  tabWidth: 2,
  useTabs: false,
  logicalOperatorNewline: "before",
  expressionWidth: 60,
  linesBetweenQueries: 2,
};

export function formatSql(sql: string): string {
  if (!sql || !sql.trim()) return sql;
  try {
    return format(sql, DEFAULTS);
  } catch {
    // sql-formatter throws on syntax errors — leave the query untouched
    return sql;
  }
}

export function canFormat(sql: string): boolean {
  if (!sql || !sql.trim()) return false;
  try {
    format(sql, DEFAULTS);
    return true;
  } catch {
    return false;
  }
}