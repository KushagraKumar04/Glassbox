import type { KPIArtifact, KPICard } from "@/features/chat/types";

import { Sparkline } from "./Sparkline";

interface Props {
  artifact: KPIArtifact;
}

export function KPICards({ artifact }: Props) {
  const cards = artifact.cards ?? [];
  if (cards.length === 0) return null;

  // Column count: 1 card → 1 col; 2-4 cards → same count; >4 → 4 cols
  const cols =
    cards.length === 1 ? 1 : cards.length <= 4 ? cards.length : 4;

  return (
    <div className="fade-up">
      <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted/70 mb-2">
        Key metrics
      </div>
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        }}
      >
        {cards.map((c, i) => (
          <Card key={i} card={c} compact={cards.length > 2} />
        ))}
      </div>
      {artifact.note && (
        <div className="font-mono text-[10px] text-muted/60 mt-2">
          {artifact.note}
        </div>
      )}
    </div>
  );
}

function Card({ card, compact }: { card: KPICard; compact: boolean }) {
  const { display, suffix } = formatValue(card.value, card.format, card.unit);

  return (
    <div className="glass glass-hover rounded-2xl p-4">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted/70 mb-2 truncate">
        {card.label}
      </div>

      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span
          className="font-mono font-bold leading-none"
          style={{
            fontSize: compact ? 22 : 30,
            color: "#22D3EE",
            letterSpacing: "-0.02em",
          }}
        >
          {display}
        </span>
        {suffix && (
          <span className="font-mono text-[12px] text-muted/80">{suffix}</span>
        )}
      </div>

      {card.sparkline && card.sparkline.length >= 5 && (
        <div className="mt-3 -mx-1">
          <Sparkline data={card.sparkline} />
        </div>
      )}
    </div>
  );
}

/* ── Formatter ─────────────────────────────────────────── */

function formatValue(
  value: number,
  format: string,
  unit?: string,
): { display: string; suffix?: string } {
  if (!Number.isFinite(value)) {
    return { display: "—" };
  }

  if (format === "currency") {
    const symbol = currencySymbol(unit);
    const digits = Math.abs(value) >= 1000 ? 0 : 2;
    return {
      display: `${symbol}${value.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })}`,
    };
  }

  if (format === "percent") {
    return {
      display: value.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      }),
      suffix: "%",
    };
  }

  // Plain number
  return {
    display: value.toLocaleString(undefined, {
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }),
    suffix: unit || undefined,
  };
}

function currencySymbol(unit?: string): string {
  switch ((unit || "").toUpperCase()) {
    case "USD":
    case "":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "INR":
      return "₹";
    case "JPY":
      return "¥";
    default:
      return "$";
  }
}