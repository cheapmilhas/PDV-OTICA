"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, Minus } from "lucide-react";

const faqs = [
  {
    question: "O PDV Otica funciona offline?",
    answer:
      "O sistema e 100% online (cloud). Voce precisa de conexao com internet para usa-lo. Recomendamos uma conexao estavel para melhor experiencia. A vantagem e que voce acessa de qualquer lugar, a qualquer momento.",
  },
  {
    question: "Posso migrar meus dados de outro sistema?",
    answer:
      "Sim! Oferecemos suporte para importacao de dados de clientes e produtos via planilha. Entre em contato com nosso suporte para assistencia na migracao — ajudamos em todo o processo.",
  },
  {
    question: "O sistema emite nota fiscal?",
    answer:
      "Atualmente o PDV Otica nao emite NF-e diretamente. Estamos trabalhando em uma integracao futura. Voce pode usar um emissor externo em paralelo sem problemas.",
  },
  {
    question: "Quantos funcionarios podem usar o sistema?",
    answer:
      "Depende do plano escolhido. Cada plano tem um limite de usuarios simultaneos. Todos os usuarios tem login individual com permissoes personalizaveis — voce controla exatamente o que cada pessoa pode acessar.",
  },
  {
    question: "Tem contrato de fidelidade?",
    answer:
      "Nao! Voce pode cancelar a qualquer momento. Os planos mensais nao tem fidelidade. O plano anual oferece desconto e pode ser cancelado com reembolso proporcional do periodo nao utilizado.",
  },
  {
    question: "O suporte e gratuito?",
    answer:
      "Sim, todos os planos incluem suporte por WhatsApp em horario comercial. Estamos sempre prontos para ajudar com duvidas, configuracoes e treinamento da equipe.",
  },
  {
    question: "Posso testar antes de comprar?",
    answer:
      "Com certeza! Oferecemos 14 dias de teste gratis com acesso completo a todas as funcionalidades. Nao e necessario cartao de credito para comecar.",
  },
  {
    question: "O sistema e seguro?",
    answer:
      "Sim. Usamos criptografia SSL em todas as conexoes, autenticacao segura com JWT, e permissoes granulares com 57 niveis de acesso. Seus dados ficam protegidos em servidores de alta disponibilidade.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
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
      { threshold: 0.05 }
    );

    section.querySelectorAll("[data-animate]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} id="faq" className="relative py-24 md:py-32 bg-navy-900 scroll-mt-20">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/15 to-transparent" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div data-animate className="opacity-0 text-center mb-14 stagger-1">
          <p className="text-gold text-sm font-medium tracking-[0.2em] uppercase mb-4">
            FAQ
          </p>
          <h2
            className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-white"
            style={{ textWrap: "balance" } as React.CSSProperties}
          >
            Perguntas{" "}
            <span className="text-gold-gradient">frequentes</span>
          </h2>
          <p className="mt-5 text-lg text-white/35">
            Tire suas duvidas sobre o PDV Otica.
          </p>
        </div>

        {/* Accordion */}
        <div className="space-y-3">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            const panelId = `faq-panel-${index}`;
            const triggerId = `faq-trigger-${index}`;
            return (
              <div
                key={index}
                data-animate
                className={`opacity-0 stagger-${Math.min(index % 4 + 2, 8)}`}
              >
                <div
                  className={`rounded-xl border transition-[background,border-color] duration-300 ${
                    isOpen
                      ? "border-gold/20 bg-white/[0.04]"
                      : "border-white/6 bg-white/[0.02] hover:border-white/10"
                  }`}
                >
                  <button
                    id={triggerId}
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className="flex items-center justify-between w-full px-6 py-5 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 rounded-xl"
                  >
                    <span className={`text-sm font-medium pr-4 transition-colors duration-300 ${isOpen ? "text-gold-light" : "text-white/70 group-hover:text-white"}`}>
                      {faq.question}
                    </span>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-[background,color] duration-300 ${
                      isOpen ? "bg-gold/15 text-gold" : "bg-white/5 text-white/30"
                    }`}>
                      {isOpen ? (
                        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </div>
                  </button>
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={triggerId}
                    className={`grid transition-[grid-template-rows] duration-300 ${
                      isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="px-6 pb-5 text-sm text-white/35 leading-relaxed">
                        {faq.answer}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
