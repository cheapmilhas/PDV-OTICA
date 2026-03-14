"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef } from "react";

export function CTASection() {
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
    <section ref={sectionRef} className="relative py-24 md:py-32 bg-gradient-to-b from-sand-50 to-teal-50/50 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />

      {/* Dot pattern */}
      <div className="absolute inset-0 dot-pattern opacity-50" />

      {/* Soft glow */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-[600px] h-[400px] bg-gradient-to-r from-teal-100/30 via-teal-50/20 to-teal-100/30 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div data-animate className="opacity-0 stagger-1">
          <p className="text-teal-600 text-sm font-medium tracking-[0.2em] uppercase mb-6">
            Comece agora
          </p>
        </div>

        <h2
          data-animate
          className="opacity-0 text-3xl md:text-4xl lg:text-5xl font-display font-bold text-gray-900 leading-tight stagger-2"
          style={{ textWrap: "balance" } as React.CSSProperties}
        >
          Pronto para modernizar{" "}
          <span className="text-teal-gradient">sua otica?</span>
        </h2>

        <p data-animate className="opacity-0 mt-6 text-lg text-gray-500 max-w-xl mx-auto stagger-3">
          Comece seu teste gratis de 14 dias agora. Sem cartao de credito, sem compromisso.
        </p>

        <div data-animate className="opacity-0 mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 stagger-4">
          <Link
            href="/registro"
            className="group w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-10 py-4 text-base font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 transition-[background,transform,box-shadow] shadow-lg shadow-teal-600/20 hover:shadow-teal-600/30 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:ring-offset-2"
          >
            Comecar teste gratis
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
          </Link>
        </div>

        <p data-animate className="opacity-0 mt-8 text-sm text-gray-400 stagger-5">
          Ou fale com a gente pelo WhatsApp:{" "}
          <a
            href="https://wa.me/5585999999999"
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-600 hover:text-teal-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 rounded"
          >
            (85) 99999-9999
          </a>
        </p>
      </div>
    </section>
  );
}
