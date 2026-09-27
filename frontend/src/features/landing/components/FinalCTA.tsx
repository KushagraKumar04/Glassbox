import { ArrowRight, Github, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { ScrollReveal } from "./ScrollReveal";

export function FinalCTA() {
  const nav = useNavigate();

  return (
    <section className="py-24 px-6">
      <div className="max-w-[820px] mx-auto">
        <ScrollReveal>
          <div
            className="relative rounded-3xl overflow-hidden text-center p-12 sm:p-16"
            style={{
              background:
                "linear-gradient(135deg, rgba(34,211,238,.08) 0%, rgba(139,92,246,.08) 100%), var(--aida-glass-strong)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(34,211,238,.22)",
              boxShadow:
                "0 40px 100px -20px rgba(0,0,0,.5), 0 0 80px -40px rgba(34,211,238,.5)",
            }}
          >
            {/* Rotating rings behind the cube */}
            <div className="relative w-[96px] h-[96px] mx-auto mb-8">
              <div className="hero-cube">
                <img
                  src="/logo-mark.png"
                  alt=""
                  width={76}
                  height={76}
                  className="w-[76px] h-[76px]"
                  style={{
                    transform: "translate(-3px, 1px)",
                    filter:
                      "drop-shadow(0 0 40px rgba(34,211,238,.55)) drop-shadow(0 0 80px rgba(139,92,246,.25))",
                  }}
                  aria-hidden="true"
                />
              </div>
              <div className="hero-orbit" aria-hidden="true">
                <span className="hero-orbit-dot" />
              </div>
            </div>

            <h2
              className="font-mono font-bold tracking-tight mb-4"
              style={{ fontSize: "clamp(24px, 3.6vw, 40px)" }}
            >
              Ready to see the proof?
            </h2>
            <p className="text-muted text-[14px] max-w-[440px] mx-auto leading-relaxed mb-10">
              Upload a file. Ask a question. Watch every step.
              No sign-up wall, no credit card, no mystery.
            </p>

            <div className="flex items-center justify-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => nav("/home")}
                className="btn-hero-primary group"
              >
                Start analyzing
                <ArrowRight
                  size={14}
                  strokeWidth={2.5}
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </button>
              <button
                type="button"
                onClick={() => nav("/sources")}
                className="btn-hero-secondary"
              >
                <Upload size={14} strokeWidth={2.2} />
                Upload data
              </button>
            </div>

            <div className="mt-8 flex items-center justify-center gap-2 flex-wrap text-muted/60">
              <Github size={12} strokeWidth={2} />
              <span className="font-mono text-[10.5px]">
                MIT license · self-host in 5 minutes
              </span>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}