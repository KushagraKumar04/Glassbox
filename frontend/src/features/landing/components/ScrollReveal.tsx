/**
 * Wraps children in a reveal-on-scroll animation.
 *
 * Usage:
 *   <ScrollReveal delay={80}>
 *     <section>…</section>
 *   </ScrollReveal>
 */
import { useScrollReveal } from "../hooks";
import { cn } from "@/shared/utils/cn";

interface Props {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  /** Distance to travel before reveal. Default 24px. */
  y?: number;
}

export function ScrollReveal({
  children,
  delay = 0,
  className,
  y = 24,
}: Props) {
  const { ref, revealed } = useScrollReveal<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={cn("reveal", revealed && "revealed", className)}
      style={{
        transitionDelay: `${delay}ms`,
        // Consumed by the CSS class
        ["--reveal-y" as string]: `${y}px`,
      }}
    >
      {children}
    </div>
  );
}