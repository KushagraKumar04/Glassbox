import { ArrowRight, Sparkles } from "lucide-react";

import type { NextQuestion } from "@/features/chat/types";

interface Props {
  questions: NextQuestion[];
  onAsk: (q: string) => void;
  disabled?: boolean;
}

export function NextQuestions({ questions, onAsk, disabled }: Props) {
  if (!questions || questions.length === 0) return null;

  return (
    <div className="fade-up">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={11} className="text-cyan" strokeWidth={2} />
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted/70">
          Suggested next
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {questions.map((q, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onAsk(q.question)}
            disabled={disabled}
            className="glass glass-hover rounded-xl px-3 py-2 text-left cursor-pointer focusable disabled:opacity-50 disabled:cursor-not-allowed group flex items-center gap-2 max-w-full"
            title={q.reason || undefined}
          >
            <span className="text-[12.5px] leading-snug truncate">
              {q.question}
            </span>
            <ArrowRight
              size={12}
              className="text-muted/50 group-hover:text-cyan transition-colors flex-none"
              strokeWidth={2}
            />
          </button>
        ))}
      </div>
    </div>
  );
}