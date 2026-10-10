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
