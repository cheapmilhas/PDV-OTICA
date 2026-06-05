"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, MessageCircle, Sparkles, ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { REGISTER_URL, WHATSAPP_URL } from "@/lib/constants";
import { featureIcons, type FeaturePage } from "@/content/features";
import { SectionHeading } from "@/components/home/section-heading";
import { FinalCta } from "@/components/home/final-cta";
import { BrowserFrame } from "@/components/landing-layout/browser-frame";

interface FeaturePageViewProps {
  data: FeaturePage;
}

function resolveIcon(name: string): LucideIcon {
  return featureIcons[name] ?? Sparkles;
}

export function FeaturePageView({ data }: FeaturePageViewProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <>
      {/* 1. Hero da feature */}
      <section className="pt-32 pb-16">
        <div className="container-custom">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Esquerda */}
            <div>
              <p
                className="text-xs font-bold uppercase tracking-[0.15em] mb-4"
                style={{ color: "var(--brand-primary)" }}
              >
                {data.eyebrow}
              </p>
              <h1
                className="font-heading font-extrabold tracking-tight"
                style={{
                  fontSize: "var(--text-h1)",
                  lineHeight: 1.08,
                  letterSpacing: "-0.025em",
                  color: "var(--lp-foreground)",
                }}
              >
                {data.title}
              </h1>
              <p
                className="mt-5 max-w-xl"
                style={{ color: "var(--lp-muted)", fontSize: "1.05rem", lineHeight: 1.65 }}
              >
                {data.subtitle}
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link
                  href={REGISTER_URL}
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-7 py-3.5 text-sm font-bold text-white group"
                  style={{
                    background: "var(--gradient-brand-vivid)",
                    boxShadow: "0 6px 24px var(--brand-glow)",
                    minHeight: "52px",
                  }}
                >
                  Começar grátis
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-7 py-3.5 text-sm font-semibold transition-colors cursor-pointer"
                  style={{
                    minHeight: "52px",
                    background: "var(--lp-surface)",
                    border: "1px solid var(--lp-border-hover)",
                    color: "var(--lp-foreground)",
                  }}
                >
                  <MessageCircle className="h-4 w-4" style={{ color: "var(--brand-primary)" }} />
                  Falar com consultor
                </a>
              </div>
            </div>

            {/* Direita — mockup leve */}
            <div>
              <BrowserFrame url={`vis.app.br/${data.slug}`}>
                <div className="p-6" style={{ background: "var(--lp-surface)" }}>
                  {data.mockupCaption && (
                    <p
                      className="text-sm font-semibold mb-5"
                      style={{ color: "var(--lp-foreground)" }}
                    >
                      {data.mockupCaption}
                    </p>
                  )}
                  <div className="space-y-3">
                    {[0, 1, 2].map((row) => (
                      <div
                        key={row}
                        className="rounded-xl p-4 flex items-center gap-4"
                        style={{
                          background: "var(--lp-background)",
                          border: "1px solid var(--lp-border)",
                        }}
                      >
                        <div
                          className="h-10 w-10 rounded-lg shrink-0"
                          style={{ background: "var(--brand-tint)" }}
                        />
                        <div className="flex-1 space-y-2">
                          <div
                            className="h-2.5 rounded-full"
                            style={{
                              width: row === 0 ? "70%" : row === 1 ? "55%" : "62%",
                              background: "var(--lp-border-hover)",
                            }}
                          />
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: row === 0 ? "45%" : row === 1 ? "38%" : "30%",
                              background: "var(--lp-border)",
                            }}
                          />
                        </div>
                        <div
                          className="h-6 w-14 rounded-md shrink-0"
                          style={{ background: "var(--brand-tint)" }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </BrowserFrame>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Tira de benefícios */}
      <section className="section-padding" style={{ background: "var(--lp-background)" }}>
        <div className="container-custom">
          <div className="grid md:grid-cols-3 gap-6">
            {data.benefits.map((b) => {
              const Icon = resolveIcon(b.icon);
              return (
                <div key={b.title}>
                  <div
                    className="flex items-center justify-center h-12 w-12 rounded-xl mb-4"
                    style={{ background: "var(--brand-tint)", color: "var(--brand-primary)" }}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3
                    className="font-heading font-bold text-lg mb-2"
                    style={{ color: "var(--lp-foreground)" }}
                  >
                    {b.title}
                  </h3>
                  <p style={{ color: "var(--lp-muted)", lineHeight: 1.6 }}>{b.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. Sub-recursos */}
      <section className="section-padding">
        <div className="container-custom">
          <SectionHeading title="Recursos que fazem a diferença" align="center" />
          <div className="grid md:grid-cols-2 gap-5">
            {data.subFeatures.map((sub) => (
              <div key={sub.title} className="vis-card">
                <h3
                  className="font-heading font-bold text-base mb-2"
                  style={{ color: "var(--lp-foreground)" }}
                >
                  {sub.title}
                </h3>
                <p style={{ color: "var(--lp-muted)", lineHeight: 1.6 }}>{sub.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Mini-FAQ */}
      <section className="section-padding" style={{ background: "var(--lp-background)" }}>
        <div className="container-custom">
          <SectionHeading eyebrow="Dúvidas" title="Perguntas frequentes" align="center" />
          <div className="max-w-3xl mx-auto space-y-3">
            {data.faq.map((item, i) => {
              const isOpen = openFaq === i;
              return (
                <div
                  key={item.q}
                  className="rounded-2xl overflow-hidden"
                  style={{
                    background: "var(--lp-surface)",
                    border: "1px solid var(--lp-border)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
                    aria-expanded={isOpen}
                  >
                    <span
                      className="font-semibold"
                      style={{ color: "var(--lp-foreground)" }}
                    >
                      {item.q}
                    </span>
                    <ChevronDown
                      className="h-5 w-5 shrink-0 transition-transform duration-200"
                      style={{
                        color: "var(--brand-primary)",
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                      }}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-5 -mt-1">
                      <p style={{ color: "var(--lp-muted)", lineHeight: 1.65 }}>{item.a}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5. CTA final */}
      <FinalCta />
    </>
  );
}
