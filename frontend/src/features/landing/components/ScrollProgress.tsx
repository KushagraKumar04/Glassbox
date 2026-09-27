import { useScrollProgress } from "../hooks";

export function ScrollProgress() {
  const progress = useScrollProgress();

  return (
    <div
      className="fixed top-0 left-0 right-0 h-0.5 z-[60] pointer-events-none"
      style={{ background: "transparent" }}
      aria-hidden="true"
    >
      <div
        className="h-full origin-left"
        style={{
          transform: `scaleX(${progress})`,
          background:
            "linear-gradient(90deg, #22D3EE 0%, #8B5CF6 60%, #F472B6 100%)",
          boxShadow: "0 0 12px rgba(34,211,238,.55)",
          transition: "transform 80ms linear",
        }}
      />
    </div>
  );
}