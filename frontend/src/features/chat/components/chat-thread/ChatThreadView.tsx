/**
 * Chat-style thread view.
 *
 * Renders every completed run in the current conversation, oldest first,
 * with the currently-streaming run appended at the bottom.
 */
import { useEffect, useRef } from "react";

import { AgentRail } from "../AgentRail";
import { StreamingAnswerCard } from "../StreamingAnswerCard";
import { AnswerStream } from "../AnswerStream";
import { ChatMessage } from "./ChatMessage";

import type { Artifact, AgentStep, RunState } from "../../types";
import type { RunFull } from "@/features/history/api";

interface Props {
  runs: RunFull[];
  /** Live streaming state for the current in-flight run. */
  streaming: {
    active: boolean;
    question: string;
    steps: AgentStep[];
    artifacts: Artifact[];
    state: RunState;
    elapsedMs: number | null;
    streamingAnswer: string;
  };
  onAsk?: (q: string) => void;
}

export function ChatThreadView({ runs, streaming, onAsk }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  // Detect user scroll — don't fight them if they're reading history
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const distFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      userScrolledUpRef.current = distFromBottom > 200;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (userScrolledUpRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [runs.length, streaming.artifacts.length, streaming.streamingAnswer.length]);

  const isEmpty = runs.length === 0 && !streaming.active;

  return (
    <main
      ref={containerRef}
      className="flex-1 overflow-y-auto"
    >
      <div className="max-w-[880px] mx-auto px-6 pt-6 pb-8 space-y-6">
        {isEmpty && (
          <div className="text-center py-24 text-muted">
            <div className="font-mono text-[13px] mb-2">
              Start a conversation
            </div>
            <div className="text-[12.5px]">
              Ask a question below. Follow-ups keep the full thread visible.
            </div>
          </div>
        )}

        {runs.map((run, i) => (
          <ChatMessage
            key={run.id}
            run={run}
            active={i === runs.length - 1 && !streaming.active}
            onAsk={onAsk}
            disabled={streaming.active}
          />
        ))}

        {/* Live in-flight run */}
        {streaming.active && (
          <div className="rounded-2xl">
            {/* Question bubble */}
            <div className="flex justify-end mb-3">
              <div
                className="max-w-[75%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-snug"
                style={{
                  background: "rgba(139,92,246,.15)",
                  border: "1px solid rgba(139,92,246,.3)",
                  color: "#E8EEF8",
                }}
              >
                {streaming.question}
              </div>
            </div>

            <AgentRail
              steps={streaming.steps}
              elapsedMs={streaming.elapsedMs}
              state={streaming.state}
            />

            <AnswerStream
              artifacts={streaming.artifacts}
              streamingAnswer={streaming.streamingAnswer}
              question={streaming.question}
            />

            <div className="sr-only">
              <StreamingAnswerCard
                text={streaming.streamingAnswer}
                artifacts={streaming.artifacts}
              />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </main>
  );
}