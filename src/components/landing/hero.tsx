"use client";

import Link from "next/link";
import { CheckCircle, ArrowRight, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";

const trustBadges = [
  "14 dias gratis",
  "Sem cartao de credito",
  "Suporte incluso",
];

const stats = [
  { value: "500+", label: "Oticas ativas" },
  { value: "99.9%", label: "Uptime" },
  { value: "50k+", label: "Vendas/mes" },
];

export function Hero() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (prefersReduced) {
              entry.target.classList.remove("opacity-0");
            } else {
              entry.target.classList.add("animate-fade-up");
              entry.target.classList.remove("opacity-0");
            }
          }
        });
      },
      { threshold: 0.1 }
    );

    section.querySelectorAll("[data-animate]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="relative min-h-screen flex items-center pt-20 pb-20 overflow-hidden">
      {/* Background layers */}
      <div className="absolute inset-0 bg-navy-900" />

      {/* Radial glow */}
      <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[1000px] h-[800px] bg-gradient-radial from-gold/8 via-gold/3 to-transparent rounded-full blur-3xl" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-gradient-to-tl from-gold/5 to-transparent rounded-full blur-3xl" />

      {/* Diagonal lines pattern */}
      <div className="absolute inset-0 diagonal-lines opacity-40" />

      {/* Grain */}
      <div className="absolute inset-0 grain" />

      {/* Horizontal accent line */}
      <div className="absolute top-1/2 left-0 w-full h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-20 items-center">
          {/* Left column - Text */}
          <div>
            {/* Badge */}
            <div
              data-animate
              className="opacity-0 inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-gold/20 bg-gold/5 text-gold text-sm font-medium mb-8 stagger-1"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Sistema completo para gestao de oticas
            </div>

            {/* Title */}
            <h1
              data-animate
              className="opacity-0 text-4xl sm:text-5xl md:text-6xl lg:text-[3.5rem] xl:text-6xl font-display font-bold text-white leading-[1.1] tracking-tight stagger-2"
              style={{ textWrap: "balance" } as React.CSSProperties}
            >
              Gerencie sua otica com{" "}
              <span className="text-gold-gradient">
                eficiencia total
              </span>
            </h1>

            {/* Subtitle */}
            <p
              data-animate
              className="opacity-0 mt-6 text-lg text-white/40 max-w-lg leading-relaxed stagger-3"
            >
              PDV, estoque, financeiro, CRM, ordens de servico e muito mais
              — tudo integrado em uma plataforma moderna e facil de usar.
            </p>

            {/* CTAs */}
            <div
              data-animate
              className="opacity-0 mt-10 flex flex-col sm:flex-row items-start gap-4 stagger-4"
            >
              <Link
                href="/registro"
                className="group w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 text-base font-semibold text-navy-900 bg-gradient-to-r from-gold to-gold-light rounded-xl hover:from-gold-light hover:to-gold transition-[background,transform,box-shadow] shadow-xl shadow-gold/20 hover:shadow-gold/30 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900"
              >
                Comecar teste gratis
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
              </Link>
              <Link
                href="/#funcionalidades"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-medium text-white/70 border border-white/10 rounded-xl hover:bg-white/5 hover:text-white hover:border-white/20 transition-[background,color,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
              >
                Conheca as funcionalidades
              </Link>
            </div>

            {/* Trust badges */}
            <div
              data-animate
              className="opacity-0 mt-10 flex flex-wrap items-center gap-6 stagger-5"
            >
              {trustBadges.map((badge) => (
                <div key={badge} className="flex items-center gap-2 text-sm text-white/30">
                  <CheckCircle className="h-4 w-4 text-gold/60" aria-hidden="true" />
                  {badge}
                </div>
              ))}
            </div>
          </div>

          {/* Right column - Dashboard mockup */}
          <div
            data-animate
            className="opacity-0 relative stagger-5"
            aria-hidden="true"
          >
            {/* Glow behind card */}
            <div className="absolute -inset-8 bg-gradient-to-b from-gold/10 via-gold/5 to-transparent rounded-3xl blur-3xl" />

            <div className="relative rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden shadow-2xl gold-glow">
              {/* Browser bar */}
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/5 bg-white/[0.02]">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-white/10" />
                  <div className="w-3 h-3 rounded-full bg-white/10" />
                  <div className="w-3 h-3 rounded-full bg-white/10" />
                </div>
                <div className="flex-1 ml-4">
                  <div className="w-52 h-6 rounded-md bg-white/5 mx-auto flex items-center justify-center">
                    <span className="text-[11px] text-white/20 tracking-wide">app.pdvotica.com</span>
                  </div>
                </div>
              </div>

              {/* Dashboard preview */}
              <div className="p-6 md:p-8 space-y-5">
                {/* Metric cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Vendas hoje", value: "R$ 4.280", accent: "text-emerald-400" },
                    { label: "Ordens ativas", value: "12", accent: "text-gold" },
                    { label: "Clientes novos", value: "8", accent: "text-sky-400" },
                    { label: "Produtos", value: "1.847", accent: "text-rose-400" },
                  ].map((card) => (
                    <div key={card.label} className="rounded-lg bg-white/[0.03] border border-white/5 p-3.5">
                      <p className="text-[11px] text-white/25 tracking-wide">{card.label}</p>
                      <p className={`text-lg font-bold mt-1 tabular-nums ${card.accent}`}>
                        {card.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Chart placeholder */}
                <div className="rounded-lg bg-white/[0.02] border border-white/5 p-4 h-28">
                  <div className="flex items-end justify-between h-full gap-1.5">
                    {[40, 55, 35, 70, 50, 80, 60, 75, 90, 65, 85, 95].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t bg-gradient-to-t from-gold/30 to-gold/10"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>

                {/* Table rows */}
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg bg-white/[0.02] border border-white/5 p-3">
                      <div className="w-8 h-8 rounded-full bg-white/5" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-2.5 w-32 rounded bg-white/8" />
                        <div className="h-2 w-20 rounded bg-white/4" />
                      </div>
                      <div className="h-6 w-16 rounded-full bg-gold/10" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div
          data-animate
          className="opacity-0 mt-20 grid grid-cols-3 gap-8 max-w-xl mx-auto lg:mx-0 stagger-6"
        >
          {stats.map((stat, i) => (
            <div key={stat.label} className={`text-center lg:text-left ${i > 0 ? "border-l border-white/5 pl-8" : ""}`}>
              <p className="text-2xl md:text-3xl font-display font-bold text-gold-gradient tabular-nums">{stat.value}</p>
              <p className="text-xs text-white/30 mt-1 tracking-wide uppercase">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
