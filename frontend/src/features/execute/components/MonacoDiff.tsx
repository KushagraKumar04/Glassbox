/**
 * Read-only side-by-side diff between the original generated code and the
 * current edited version.
 *
 * Uses Monaco's built-in DiffEditor — same theme, same keybindings, no
 * additional npm packages.
 */
import { DiffEditor, type BeforeMount } from "@monaco-editor/react";

import { useTheme } from "@/features/theme/store";

interface Props {
  original: string;
  modified: string;
  language: "sql" | "python";
  height?: number;
}

export function MonacoDiff({
  original,
  modified,
  language,
  height = 320,
}: Props) {
  const theme = useTheme((s) => s.theme);
  const handleBeforeMount: BeforeMount = (monaco) => {
    // Same theme as MonacoEditor — kept in sync intentionally.
    monaco.editor.defineTheme("aida-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "64748B", fontStyle: "italic" },
        { token: "keyword", foreground: "8B5CF6", fontStyle: "bold" },
        { token: "string", foreground: "34D399" },
        { token: "number", foreground: "FBBF24" },
        { token: "type", foreground: "22D3EE" },
      ],
      colors: {
        "editor.background": "#0B1020",
        "editor.foreground": "#E8EEF8",
        "editorLineNumber.foreground": "#3F4A5E",
        "editorLineNumber.activeForeground": "#22D3EE",
        "editorCursor.foreground": "#22D3EE",
        "editor.selectionBackground": "#22D3EE33",
        // Diff-specific
        "diffEditor.insertedTextBackground": "#34D39933",
        "diffEditor.removedTextBackground": "#F8717133",
        "diffEditor.insertedLineBackground": "#34D39915",
        "diffEditor.removedLineBackground": "#F8717115",
        "diffEditor.diagonalFill": "#11182766",
        "diffEditor.border": "#94A3B82C",
        "scrollbarSlider.background": "#94A3B82C",
        "scrollbarSlider.hoverBackground": "#94A3B84D",
      },
    });

    monaco.editor.defineTheme("aida-light", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "comment", foreground: "94A3B8", fontStyle: "italic" },
        { token: "keyword", foreground: "7C3AED", fontStyle: "bold" },
        { token: "string", foreground: "059669" },
        { token: "number", foreground: "D97706" },
        { token: "type", foreground: "0891B2" },
      ],
      colors: {
        "editor.background": "#FFFFFF",
        "editor.foreground": "#0B1220",
        "editorLineNumber.foreground": "#94A3B8",
        "editorLineNumber.activeForeground": "#0891B2",
        "editorCursor.foreground": "#0891B2",
        "editor.selectionBackground": "#0891B233",
        "diffEditor.insertedTextBackground": "#05966922",
        "diffEditor.removedTextBackground": "#DC262622",
        "diffEditor.insertedLineBackground": "#05966912",
        "diffEditor.removedLineBackground": "#DC262612",
        "diffEditor.diagonalFill": "#E2E8F066",
        "diffEditor.border": "#94A3B82C",
        "scrollbarSlider.background": "#94A3B82C",
        "scrollbarSlider.hoverBackground": "#94A3B84D",
      },
    });
  };

  return (
    <div
      className="rounded-xl overflow-hidden fade-up"
      style={{
        border: "1px solid var(--aida-border)",
        background: "var(--aida-code-bg-solid)",
      }}
    >
      <DiffEditor
        original={original}
        modified={modified}
        language={language}
        theme={theme === "light" ? "aida-light" : "aida-dark"}
        beforeMount={handleBeforeMount}
        height={`${height}px`}
        loading={
          <div className="flex items-center justify-center h-full text-muted text-[12px] font-mono">
            Loading diff…
          </div>
        }
        options={{
          readOnly: true,
          renderSideBySide: true,
          fontSize: 12,
          fontFamily:
            '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
          lineHeight: 20,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
            useShadows: false,
          },
          overviewRulerLanes: 0,
          hideUnchangedRegions: {
            enabled: false,
          },
          renderOverviewRuler: false,
          ignoreTrimWhitespace: false,
          wordWrap: "on",
        }}
      />
      <div
        className="flex items-center gap-3 px-3.5 py-2 font-mono text-[10.5px] text-muted/70"
        style={{ borderTop: "1px solid rgba(148,163,184,.16)" }}
      >
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-2 h-2 rounded-sm"
            style={{ background: "rgba(248,113,113,.4)" }}
          />
          original
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-2 h-2 rounded-sm"
            style={{ background: "rgba(52,211,153,.4)" }}
          />
          edited
        </span>
        <span className="ml-auto">read-only comparison</span>
      </div>
    </div>
  );
}