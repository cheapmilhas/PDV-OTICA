"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { BrowserFrame } from "@/components/landing-layout/browser-frame";
import { featureMockups } from "./login-feature-mockups";
import type { CarouselSlide } from "./login-panel-content";

interface LoginFeatureCarouselProps {
  slides: CarouselSlide[];
  /** ms entre trocas automáticas. */
  intervalMs?: number;
}

const DEFAULT_INTERVAL = 7500;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function LoginFeatureCarousel({ slides, intervalMs = DEFAULT_INTERVAL }: LoginFeatureCarouselProps) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = prefersReducedMotion();
  }, []);

  const go = useCallback(
    (next: number) => setActive((prev) => (next + slides.length) % slides.length),
    [slides.length],
  );

  // Auto-rotação — pausada por hover/foco, aba oculta, reduced-motion, ou ≤1 slide.
  useEffect(() => {
    if (paused || reduced.current || slides.length <= 1) return;
    const id = setInterval(() => setActive((p) => (p + 1) % slides.length), intervalMs);
    return () => clearInterval(id);
  }, [paused, slides.length, intervalMs]);

  // Pausa quando a aba vai para background.
  useEffect(() => {
    const onVis = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { setPaused(true); go(active + 1); }
    else if (e.key === "ArrowLeft") { setPaused(true); go(active - 1); }
  };

  if (slides.length === 0) return null;
  const current = slides[active];
  const Mockup = featureMockups[current.slug];

  return (
    <div
      role="group"
      aria-roledescription="carrossel"
      aria-label="Funcionalidades do Vis"
      className="flex flex-col gap-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <BrowserFrame url="vis.app.br/dashboard">
        {/* min-height mata o "pulo" de altura entre slides na transição */}
        <div key={current.slug} className="lfc-fade min-h-[9.5rem]" aria-live="off">
          {Mockup ? <Mockup /> : null}
        </div>
      </BrowserFrame>

      <div className="min-h-[3.5rem]">
        <p className="text-sm font-semibold" style={{ color: "var(--lp-foreground)" }}>
          {current.name}
        </p>
        <p className="mt-0.5 text-xs leading-snug" style={{ color: "var(--lp-muted)" }}>
          {current.blurb}
        </p>
      </div>

      {slides.length > 1 && (
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Selecionar funcionalidade">
          {slides.map((s, i) => (
            <button
              key={s.slug}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-current={i === active ? "true" : undefined}
              aria-label={`Ver: ${s.name}`}
              onClick={() => { setPaused(true); setActive(i); }}
              className="lfc-dot"
              data-active={i === active}
              data-paused={paused || undefined}
            >
              {/* barra de progresso: preenche no dot ativo, sincronizada com o intervalo */}
              {i === active && <span className="lfc-progress" key={`${current.slug}-${paused}`} />}
            </button>
          ))}
        </div>
      )}

      <style>{`
        .lfc-fade { animation: lfcFade 400ms cubic-bezier(0.22,1,0.36,1); }
        @keyframes lfcFade {
          from { opacity: 0; transform: translateX(8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .lfc-dot {
          position: relative; height: 6px; width: 6px; border-radius: 9999px; padding: 0;
          background: var(--lp-border-hover); border: none; cursor: pointer; overflow: hidden;
          transition: width 240ms cubic-bezier(0.22,1,0.36,1), background 200ms ease;
        }
        .lfc-dot[data-active="true"] { width: 24px; background: var(--brand-tint); }
        .lfc-dot:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; }
        .lfc-progress {
          position: absolute; inset: 0; display: block; border-radius: 9999px;
          background: var(--brand-primary); transform-origin: left center;
          animation: lfcFill ${intervalMs}ms linear forwards;
        }
        .lfc-dot[data-paused] .lfc-progress { animation-play-state: paused; }
        @keyframes lfcFill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @media (prefers-reduced-motion: reduce) {
          .lfc-fade { animation: none; }
          .lfc-progress { animation: none; transform: scaleX(1); }
        }
      `}</style>
    </div>
  );
}
