import { Code2, ShieldAlert, Sparkles, Sigma } from "lucide-react";

import { ChartRenderer } from "@/features/charts/components/ChartRenderer";
import { KPICards } from "@/features/charts/components/KPICards";
import { useInspector } from "@/features/inspector/store";

import { findArtifact } from "../types";
import type {
  AnswerArtifact,
  Artifact,
  ChartArtifact,
  DaxArtifact,
  ErrorArtifact,
  KPIArtifact,
  PythonArtifact,
  QualityArtifact,
  SqlArtifact,
} from "../types";
import { StreamingAnswerCard } from "./StreamingAnswerCard";

interface Props {
  artifacts: Artifact[];
  /** Live narrative text — shown above the artifacts while the run streams. */
  streamingAnswer?: string;
}

export function AnswerStream({ artifacts, streamingAnswer = "" }: Props) {
  const answer = findArtifact(artifacts, "answer") as AnswerArtifact | undefined;
  const kpi = findArtifact(artifacts, "kpi") as KPIArtifact | undefined;
  const chart = findArtifact(artifacts, "chart") as ChartArtifact | undefined;
  const sql = findArtifact(artifacts, "sql") as SqlArtifact | undefined;
  const py = findArtifact(artifacts, "python") as PythonArtifact | undefined;
  const dax = findArtifact(artifacts, "dax") as DaxArtifact | undefined;
  const quality = findArtifact(artifacts, "quality") as
    | QualityArtifact
    | undefined;
  const errors = artifacts.filter(
    (a) => a.kind === "error",
  ) as ErrorArtifact[];

  if (!answer && !chart && !kpi && !sql && !py && !dax && errors.length === 0) {
    return null;
  }

  const kpiHasSparkline = (kpi?.cards ?? []).some(
    (c) => c.sparkline && c.sparkline.length >= 5,
  );
  const showChart =
    chart && chart.spec.data.length > 0 && !kpiHasSparkline;

  return (
    <div className="space-y-4 fade-up">
      <StreamingAnswerCard text={streamingAnswer} artifacts={artifacts} />
      {answer && <AnswerCard artifact={answer} quality={quality} />}
      {kpi && kpi.cards.length > 0 && <KPICards artifact={kpi} />}
      {showChart && (
        <ChartRenderer
          spec={chart.spec}
          filenameHint={answer?.content.summary}
        />
      )}
      {sql?.content && <SqlCard artifact={sql} />}
      {py?.content && <PythonCard artifact={py} />}
      {dax?.content && <DaxCard artifact={dax} />}
      {errors.map((e, i) => (
        <ErrorCard key={i} artifact={e} />
      ))}
    </div>
  );
}

/* ── Answer ─────────────────────────────────────────────── */

function AnswerCard({
  artifact,
  quality,
}: {
  artifact: AnswerArtifact;
  quality?: QualityArtifact;
}) {
  const confidence = quality?.content.confidence;
  const confidenceColor =
    confidence === "high"
      ? "#34D399"
      : confidence === "medium"
        ? "#FBBF24"
        : confidence === "low"
          ? "#F87171"
          : "#AAB6CC";

  return (
    <div
      className="glass rounded-2xl p-5"
      style={{ borderColor: "rgba(34,211,238,.2)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-cyan" strokeWidth={2} />
        <span
          className="font-mono text-[10.5px] uppercase tracking-wider"
          style={{ color: "#22D3EE" }}
        >
          Answer
        </span>
        {confidence && (
          <span
            className="ml-auto font-mono text-[10.5px]"
            style={{ color: confidenceColor }}
          >
            confidence: {confidence}
          </span>
        )}
      </div>

      <p className="text-[15px] leading-relaxed mb-3">
        {artifact.content.summary}
      </p>

      {artifact.content.findings?.length ? (
        <ul className="space-y-1.5 text-[13.5px]">
          {artifact.content.findings.map((f, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="text-muted font-mono text-[11px] mt-0.5">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {artifact.content.caveats?.length ? (
        <div
          className="flex items-start gap-2.5 mt-4 pt-4 border-t"
          style={{ borderColor: "rgba(148,163,184,.16)" }}
        >
          <ShieldAlert
            size={13}
            className="text-warn flex-none mt-0.5"
            strokeWidth={2}
            aria-hidden="true"
          />
          <span className="text-[12.5px] text-muted">
            <strong className="text-warn font-medium">Caveats: </strong>
            {artifact.content.caveats.join(" · ")}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/* ── SQL ────────────────────────────────────────────────── */

function SqlCard({ artifact }: { artifact: SqlArtifact }) {
  const setTab = useInspector((s) => s.setTab);
  const setOpen = useInspector((s) => s.setOpen);

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted">
          Generated SQL
        </span>
        <span
          className="chip"
          style={{
            borderColor: artifact.valid
              ? "rgba(52,211,153,.3)"
              : "rgba(248,113,113,.3)",
            color: artifact.valid ? "#34D399" : "#F87171",
          }}
        >
          {artifact.valid ? "validated" : "invalid"}
        </span>
        <button
          type="button"
          onClick={() => {
            setTab("sql");
            setOpen(true);
          }}
          className="chip cursor-pointer hover:brightness-125 focusable ml-auto"
          title="Open in inspector"
        >
          <Code2 size={10} strokeWidth={2} />
          inspector
        </button>
      </div>

      {artifact.explanation && (
        <div className="text-[12.5px] text-muted mb-3">
          {artifact.explanation}
        </div>
      )}

      <pre
        className="font-mono text-[12px] leading-[1.65] overflow-x-auto p-3.5 rounded-lg whitespace-pre"
        style={{ background: "rgba(3,7,18,.6)" }}
      >
        {artifact.content}
      </pre>
    </div>
  );
}

/* ── Python ─────────────────────────────────────────────── */

function PythonCard({ artifact }: { artifact: PythonArtifact }) {
  const setTab = useInspector((s) => s.setTab);
  const setOpen = useInspector((s) => s.setOpen);

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted">
          Generated Python
        </span>
        <button
          type="button"
          onClick={() => {
            setTab("python");
            setOpen(true);
          }}
          className="chip cursor-pointer hover:brightness-125 focusable ml-auto"
        >
          inspector
        </button>
      </div>

      {artifact.explanation && (
        <div className="text-[12.5px] text-muted mb-3">
          {artifact.explanation}
        </div>
      )}

      <pre
        className="font-mono text-[12px] leading-[1.65] overflow-x-auto p-3.5 rounded-lg whitespace-pre"
        style={{ background: "rgba(3,7,18,.6)" }}
      >
        {artifact.content}
      </pre>
    </div>
  );
}

/* ── DAX ────────────────────────────────────────────────── */

function DaxCard({ artifact }: { artifact: DaxArtifact }) {
  const setTab = useInspector((s) => s.setTab);
  const setOpen = useInspector((s) => s.setOpen);

  return (
    <div
      className="glass rounded-2xl p-5"
      style={{ borderColor: "rgba(139,92,246,.25)" }}
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Sigma size={12} className="text-violet" strokeWidth={2} />
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted">
          Power BI DAX
        </span>
        <span
          className="chip"
          style={{ borderColor: "rgba(139,92,246,.3)", color: "#8B5CF6" }}
        >
          {artifact.shape === "table" ? "calculated table" : "measure"}
        </span>
        <button
          type="button"
          onClick={() => {
            setTab("dax");
            setOpen(true);
          }}
          className="chip cursor-pointer hover:brightness-125 focusable ml-auto"
        >
          inspector
        </button>
      </div>

      {artifact.explanation && (
        <div className="text-[12.5px] text-muted mb-3">
          {artifact.explanation}
        </div>
      )}

      <pre
        className="font-mono text-[12px] leading-[1.65] overflow-x-auto p-3.5 rounded-lg whitespace-pre"
        style={{ background: "rgba(3,7,18,.6)" }}
      >
        {artifact.content}
      </pre>
    </div>
  );
}

/* ── Error ──────────────────────────────────────────────── */

function ErrorCard({ artifact }: { artifact: ErrorArtifact }) {
  return (
    <div
      className="glass rounded-2xl p-4"
      style={{ borderColor: "rgba(248,113,113,.3)" }}
    >
      <div
        className="font-mono text-[10.5px] uppercase tracking-wider mb-2"
        style={{ color: "#F87171" }}
      >
        Error
      </div>
      <div className="text-[13px]">{artifact.message}</div>
    </div>
  );
}