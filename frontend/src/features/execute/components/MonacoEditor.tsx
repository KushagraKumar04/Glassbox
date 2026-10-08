/**
 * Monaco wrapper — dark theme matched to the app.
 *
 * Supports:
 *   - ⌘↵ / Ctrl+↵  → fires onRun (when provided and not readOnly)
 *   - auto-height based on line count
 *   - a custom theme that matches the app's palette
 */
import Editor, {
  type BeforeMount,
  type OnMount,
} from "@monaco-editor/react";
import { useEffect, useRef } from "react";

import { useTheme } from "@/features/theme/store";

interface Props {
  value: string;
  language: "sql" | "python" | "json" | "dax";
  onChange?: (v: string) => void;
  onRun?: () => void;
  readOnly?: boolean;
  minHeight?: number;
  maxHeight?: number;
  /** Re-mount hint — pass the run id so a new run resets undo history. */
  editorKey?: string;
}

const LINE_HEIGHT = 20;
const PADDING = 28;

export function MonacoEditor({
  value,
  language,
  onChange,
  onRun,
  readOnly = false,
  minHeight = 140,
  maxHeight = 520,
  editorKey,
}: Props) {
  const theme = useTheme((s) => s.theme);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  // Keep the latest onRun in a ref so the keybinding always calls the
  // current closure without needing to re-register the command.
  const onRunRef = useRef(onRun);
  useEffect(() => {
    onRunRef.current = onRun;
  }, [onRun]);

  const lineCount = Math.max(1, value.split("\n").length);
  const computedHeight = Math.min(
    maxHeight,
    Math.max(minHeight, lineCount * LINE_HEIGHT + PADDING),
  );

  const handleBeforeMount: BeforeMount = (monaco) => {
    // Register DAX once. Monaco doesn't ship DAX natively.
    if (
  !monaco.languages
    .getLanguages()
    .some((l: { id: string }) => l.id === "dax")
) {
      monaco.languages.register({ id: "dax" });
      monaco.languages.setMonarchTokensProvider("dax", {
        keywords: [
          "VAR", "RETURN", "EVALUATE", "DEFINE", "MEASURE", "COLUMN", "TABLE",
          "CALCULATE", "CALCULATETABLE", "FILTER", "ALL", "ALLEXCEPT", "ALLSELECTED",
          "SUMMARIZE", "SUMMARIZECOLUMNS", "ADDCOLUMNS", "SELECTCOLUMNS",
          "SUM", "SUMX", "COUNT", "COUNTROWS", "COUNTX", "DISTINCTCOUNT",
          "AVERAGE", "AVERAGEX", "MIN", "MINX", "MAX", "MAXX",
          "DIVIDE", "IF", "SWITCH", "AND", "OR", "NOT", "IN", "BLANK",
          "RELATED", "RELATEDTABLE", "LOOKUPVALUE", "USERELATIONSHIP",
          "TREATAS", "VALUES", "DISTINCT", "TOPN", "RANKX",
          "DATEADD", "DATESYTD", "DATESMTD", "DATESQTD", "SAMEPERIODLASTYEAR",
          "PARALLELPERIOD", "TOTALYTD", "TOTALMTD", "TOTALQTD", "PREVIOUSMONTH",
          "PREVIOUSYEAR", "PREVIOUSQUARTER", "FIRSTDATE", "LASTDATE",
          "FORMAT", "CONCATENATE", "CONCATENATEX", "LEFT", "RIGHT", "MID",
          "LEN", "UPPER", "LOWER", "TRIM", "SUBSTITUTE", "SEARCH",
          "YEAR", "MONTH", "DAY", "HOUR", "MINUTE", "SECOND", "NOW", "TODAY",
        ],
        typeKeywords: ["TRUE", "FALSE", "BLANK"],
        operators: [
          "+", "-", "*", "/", "&", "=", "==", "<>", "<", ">", "<=", ">=",
          "&&", "||", "!",
        ],
        symbols: /[=><!~?:&|+\-*/^%]+/,
        tokenizer: {
          root: [
            [/\/\/.*$/, "comment"],
            [/\/\*/, "comment", "@comment"],
            [/'[^']*'/, "type"],
            [/\[[^\]]+\]/, "identifier"],
            [/"([^"\\]|\\.)*$/, "string.invalid"],
            [/"/, "string", "@string"],
            [/\d+(\.\d+)?/, "number"],
            [
              /[A-Za-z_][A-Za-z0-9_]*/,
              {
                cases: {
                  "@keywords": "keyword",
                  "@typeKeywords": "type",
                  "@default": "identifier",
                },
              },
            ],
            [/[{}()\[\]]/, "@brackets"],
            [/@symbols/, { cases: { "@operators": "operator", "@default": "" } }],
          ],
          comment: [
            [/[^/*]+/, "comment"],
            [/\*\//, "comment", "@pop"],
            [/[/*]/, "comment"],
          ],
          string: [
            [/[^"]+/, "string"],
            [/"/, "string", "@pop"],
          ],
        },
      });
    }

    monaco.editor.defineTheme("aida-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "64748B", fontStyle: "italic" },
        { token: "comment.sql", foreground: "64748B", fontStyle: "italic" },
        { token: "comment.python", foreground: "64748B", fontStyle: "italic" },
        { token: "keyword", foreground: "8B5CF6", fontStyle: "bold" },
        { token: "keyword.sql", foreground: "8B5CF6", fontStyle: "bold" },
        { token: "keyword.python", foreground: "8B5CF6", fontStyle: "bold" },
        { token: "operator", foreground: "22D3EE" },
        { token: "operator.sql", foreground: "22D3EE" },
        { token: "string", foreground: "34D399" },
        { token: "string.sql", foreground: "34D399" },
        { token: "string.python", foreground: "34D399" },
        { token: "number", foreground: "FBBF24" },
        { token: "number.sql", foreground: "FBBF24" },
        { token: "number.python", foreground: "FBBF24" },
        { token: "type", foreground: "22D3EE" },
        { token: "type.identifier.sql", foreground: "22D3EE" },
        { token: "function", foreground: "E8EEF8" },
        { token: "identifier", foreground: "E8EEF8" },
        { token: "keyword.dax", foreground: "8B5CF6", fontStyle: "bold" },
        { token: "identifier.dax", foreground: "E8EEF8" },
        { token: "type.dax", foreground: "22D3EE" },
      ],
      colors: {
        "editor.background": "#0B1020",
        "editor.foreground": "#E8EEF8",
        "editorLineNumber.foreground": "#3F4A5E",
        "editorLineNumber.activeForeground": "#22D3EE",
        "editor.lineHighlightBackground": "#11182766",
        "editor.selectionBackground": "#22D3EE33",
        "editor.inactiveSelectionBackground": "#22D3EE22",
        "editorCursor.foreground": "#22D3EE",
        "editorIndentGuide.background1": "#111827",
        "editorIndentGuide.activeBackground1": "#22D3EE44",
        "editorWidget.background": "#111827",
        "editorWidget.border": "#22D3EE33",
        "editorSuggestWidget.background": "#111827",
        "editorSuggestWidget.border": "#22D3EE33",
        "editorSuggestWidget.selectedBackground": "#22D3EE22",
        "editorHoverWidget.background": "#111827",
        "editorHoverWidget.border": "#22D3EE33",
        "scrollbarSlider.background": "#94A3B82C",
        "scrollbarSlider.hoverBackground": "#94A3B84D",
        "scrollbarSlider.activeBackground": "#94A3B866",
        "scrollbar.shadow": "#00000000",
      },
    });

    monaco.editor.defineTheme("aida-light", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "comment", foreground: "94A3B8", fontStyle: "italic" },
        { token: "comment.sql", foreground: "94A3B8", fontStyle: "italic" },
        { token: "comment.python", foreground: "94A3B8", fontStyle: "italic" },
        { token: "keyword", foreground: "7C3AED", fontStyle: "bold" },
        { token: "keyword.sql", foreground: "7C3AED", fontStyle: "bold" },
        { token: "keyword.python", foreground: "7C3AED", fontStyle: "bold" },
        { token: "operator", foreground: "0891B2" },
        { token: "operator.sql", foreground: "0891B2" },
        { token: "string", foreground: "059669" },
        { token: "string.sql", foreground: "059669" },
        { token: "string.python", foreground: "059669" },
        { token: "number", foreground: "D97706" },
        { token: "number.sql", foreground: "D97706" },
        { token: "number.python", foreground: "D97706" },
        { token: "type", foreground: "0891B2" },
        { token: "type.identifier.sql", foreground: "0891B2" },
        { token: "function", foreground: "0B1220" },
        { token: "identifier", foreground: "0B1220" },
      ],
      colors: {
        "editor.background": "#FFFFFF",
        "editor.foreground": "#0B1220",
        "editorLineNumber.foreground": "#94A3B8",
        "editorLineNumber.activeForeground": "#0891B2",
        "editor.lineHighlightBackground": "#F1F5F966",
        "editor.selectionBackground": "#0891B233",
        "editor.inactiveSelectionBackground": "#0891B222",
        "editorCursor.foreground": "#0891B2",
        "editorIndentGuide.background1": "#E2E8F0",
        "editorIndentGuide.activeBackground1": "#0891B244",
        "editorWidget.background": "#FFFFFF",
        "editorWidget.border": "#0891B233",
        "editorSuggestWidget.background": "#FFFFFF",
        "editorSuggestWidget.border": "#0891B233",
        "editorSuggestWidget.selectedBackground": "#0891B222",
        "editorHoverWidget.background": "#FFFFFF",
        "editorHoverWidget.border": "#0891B233",
        "scrollbarSlider.background": "#94A3B82C",
        "scrollbarSlider.hoverBackground": "#94A3B84D",
        "scrollbarSlider.activeBackground": "#94A3B866",
        "scrollbar.shadow": "#00000000",
      },
    });
  };

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // ⌘↵ / Ctrl+↵ → run
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => {
        onRunRef.current?.();
      },
    );
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        border: "1px solid var(--aida-border)",
        background: "var(--aida-code-bg-solid)",
      }}
    >
      <Editor
        key={editorKey}
        height={`${computedHeight}px`}
        language={language}
        value={value}
        onChange={(v) => onChange?.(v ?? "")}
        theme={theme === "light" ? "aida-light" : "aida-dark"}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        loading={
          <div className="flex items-center justify-center h-full text-muted text-[12px] font-mono">
            Loading editor…
          </div>
        }
        options={{
          readOnly,
          fontSize: 12.5,
          fontFamily:
            '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
          lineHeight: 20,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          renderLineHighlight: "line",
          lineNumbers: "on",
          glyphMargin: false,
          folding: true,
          lineDecorationsWidth: 8,
          lineNumbersMinChars: 3,
          padding: { top: 10, bottom: 10 },
          tabSize: 2,
          insertSpaces: true,
          wordWrap: "on",
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
            useShadows: false,
          },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          contextmenu: true,
          automaticLayout: true,
          stickyScroll: { enabled: false },
        }}
      />
    </div>
  );
}