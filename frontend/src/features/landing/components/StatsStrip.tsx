import { useCountUp, useScrollReveal } from "../hooks";

interface Stat {
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  label: string;
  sublabel: string;
  color: string;
}

const STATS: Stat[] = [
  {
    value: 60,
    prefix: "<",
    suffix: "s",
    label: "to first answer",
    sublabel: "for a typical CSV question",
    color: "#22D3EE",
  },
  {
    value: 100,
    suffix: "%",
    label: "answers expose SQL",
    sublabel: "every run, every time",
    color: "#8B5CF6",
  },
  {
    value: 0,
    label: "writes possible",
    sublabel: "read-only by construction",
    color: "#34D399",
  },
  {
    value: 3,
    label: "outlier detectors",
    sublabel: "z-score · IQR · MAD",
    color: "#FBBF24",
  },
];

export function StatsStrip() {
  const { ref, revealed } = useScrollReveal<HTMLDivElement>();

  return (
    <section className="py-16 px-6">
      <div className="max-w-[1100px] mx-auto" ref={ref}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATS.map((s, i) => (
            <StatCard key={i} stat={s} enabled={revealed} />
          ))}
        </div>
      </div>
    </section>
  );
}

function StatCard({ stat, enabled }: { stat: Stat; enabled: boolean }) {
  const value = useCountUp(stat.value, { enabled, duration: 1600 });
  const display = formatValue(value, stat.decimals ?? 0);

  return (
    <div
      className="glass rounded-2xl p-5 text-center"
      style={{ borderColor: "var(--aida-border)" }}
    >
      <div
        className="font-mono font-bold leading-none mb-2"
        style={{
          fontSize: "clamp(26px, 3.4vw, 40px)",
          color: stat.color,
          letterSpacing: "-0.03em",
        }}
      >
        {stat.prefix}
        {display}
        {stat.suffix}
      </div>
      <div className="text-[12.5px] text-txt/90 mb-1">{stat.label}</div>
      <div className="font-mono text-[10.5px] text-muted/70">
        {stat.sublabel}
      </div>
    </div>
  );
}

function formatValue(v: number, decimals: number): string {
  if (decimals > 0) {
    return v.toFixed(decimals);
  }
  return Math.round(v).toLocaleString();
}