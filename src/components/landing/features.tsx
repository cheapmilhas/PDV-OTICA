"use client";

import { useEffect, useRef } from "react";
import {
  ShoppingCart,
  Package,
  DollarSign,
  Users,
  BarChart3,
  Target,
  Smartphone,
  Shield,
  ClipboardList,
  FileText,
  Gift,
  Building2,
} from "lucide-react";

const features = [
  {
    icon: ShoppingCart,
    title: "PDV Rapido",
    description: "Ponto de venda otimizado para oticas com atalhos de teclado e busca inteligente de produtos.",
  },
  {
    icon: Package,
    title: "Gestao de Estoque",
    description: "Controle completo com alertas de estoque minimo, ajustes, entradas e classificacao ABC.",
  },
  {
    icon: DollarSign,
    title: "Financeiro Integrado",
    description: "Contas a pagar e receber, fluxo de caixa, DRE e controle de inadimplencia em um so lugar.",
  },
  {
    icon: Users,
    title: "CRM Inteligente",
    description: "Follow-up automatico, segmentacao de clientes, campanhas de reativacao e lembretes.",
  },
  {
    icon: BarChart3,
    title: "Relatorios Completos",
    description: "Vendas, comissoes, estoque, financeiro e muito mais com exportacao para PDF e Excel.",
  },
  {
    icon: Target,
    title: "Metas e Comissoes",
    description: "Defina metas por vendedor, acompanhe desempenho e calcule comissoes automaticamente.",
  },
  {
    icon: Smartphone,
    title: "100% Responsivo",
    description: "Acesse de qualquer dispositivo — celular, tablet ou computador. Interface adaptavel.",
  },
  {
    icon: Shield,
    title: "Permissoes Granulares",
    description: "Controle exatamente o que cada funcionario pode ver e fazer com 57 permissoes configuraveis.",
  },
  {
    icon: ClipboardList,
    title: "Ordens de Servico",
    description: "Acompanhe lentes em laboratorio com status em tempo real e notificacao ao cliente.",
  },
  {
    icon: FileText,
    title: "Orcamentos",
    description: "Crie orcamentos detalhados e converta em vendas com um clique. Envie por WhatsApp.",
  },
  {
    icon: Gift,
    title: "Cashback",
    description: "Programa de fidelidade integrado para reter clientes e aumentar vendas recorrentes.",
  },
  {
    icon: Building2,
    title: "Multi-filial",
    description: "Gerencie multiplas lojas em uma unica plataforma com dados consolidados por rede.",
  },
];

export function Features() {
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
      { threshold: 0.05, rootMargin: "0px 0px -50px 0px" }
    );

    section.querySelectorAll("[data-animate]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} id="funcionalidades" className="relative py-24 md:py-32 bg-navy-900 scroll-mt-20">
      {/* Top separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/15 to-transparent" />

      {/* Subtle background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-gradient-radial from-gold/3 to-transparent rounded-full blur-3xl" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div data-animate className="opacity-0 text-center mb-20 stagger-1">
          <p className="text-gold text-sm font-medium tracking-[0.2em] uppercase mb-4">
            Funcionalidades
          </p>
          <h2
            className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-white leading-tight"
            style={{ textWrap: "balance" } as React.CSSProperties}
          >
            Tudo que sua otica precisa{" "}
            <br className="hidden md:block" />
            <span className="text-gold-gradient">em um so lugar</span>
          </h2>
          <p className="mt-5 text-lg text-white/35 max-w-2xl mx-auto">
            Do atendimento ao financeiro, cada funcionalidade foi pensada para a realidade das oticas brasileiras.
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              data-animate
              className={`opacity-0 stagger-${Math.min(index % 6 + 1, 8)}`}
            >
              <div className="group relative glass-card rounded-2xl p-6 md:p-7 transition-[background,border-color,transform] duration-500 hover:-translate-y-1 h-full">
                {/* Icon */}
                <div className="w-12 h-12 rounded-xl bg-gold/10 border border-gold/15 flex items-center justify-center mb-5 group-hover:bg-gold/15 group-hover:border-gold/25 transition-[background,border-color] duration-500">
                  <feature.icon className="h-5 w-5 text-gold" aria-hidden="true" />
                </div>

                {/* Content */}
                <h3 className="text-base font-semibold text-white mb-2.5 group-hover:text-gold-light transition-colors duration-300">
                  {feature.title}
                </h3>
                <p className="text-sm text-white/35 leading-relaxed">
                  {feature.description}
                </p>

                {/* Corner accent */}
                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-gold/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
