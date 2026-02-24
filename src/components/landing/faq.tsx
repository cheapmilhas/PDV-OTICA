"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const faqs = [
  {
    question: "O PDV Ótica funciona offline?",
    answer:
      "O sistema é 100% online (cloud). Você precisa de conexão com internet para usá-lo. Recomendamos uma conexão estável para melhor experiência. A vantagem é que você acessa de qualquer lugar, a qualquer momento.",
  },
  {
    question: "Posso migrar meus dados de outro sistema?",
    answer:
      "Sim! Oferecemos suporte para importação de dados de clientes e produtos via planilha. Entre em contato com nosso suporte para assistência na migração — ajudamos em todo o processo.",
  },
  {
    question: "O sistema emite nota fiscal?",
    answer:
      "Atualmente o PDV Ótica não emite NF-e diretamente. Estamos trabalhando em uma integração futura. Você pode usar um emissor externo em paralelo sem problemas.",
  },
  {
    question: "Quantos funcionários podem usar o sistema?",
    answer:
      "Depende do plano escolhido. Cada plano tem um limite de usuários simultâneos. Todos os usuários têm login individual com permissões personalizáveis — você controla exatamente o que cada pessoa pode acessar.",
  },
  {
    question: "Tem contrato de fidelidade?",
    answer:
      "Não! Você pode cancelar a qualquer momento. Os planos mensais não têm fidelidade. O plano anual oferece desconto e pode ser cancelado com reembolso proporcional do período não utilizado.",
  },
  {
    question: "O suporte é gratuito?",
    answer:
      "Sim, todos os planos incluem suporte por WhatsApp em horário comercial. Estamos sempre prontos para ajudar com dúvidas, configurações e treinamento da equipe.",
  },
  {
    question: "Posso testar antes de comprar?",
    answer:
      "Com certeza! Oferecemos 14 dias de teste grátis com acesso completo a todas as funcionalidades. Não é necessário cartão de crédito para começar.",
  },
  {
    question: "O sistema é seguro?",
    answer:
      "Sim. Usamos criptografia SSL em todas as conexões, autenticação segura com JWT, e permissões granulares com 57 níveis de acesso. Seus dados ficam protegidos em servidores de alta disponibilidade.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="relative py-20 md:py-28 bg-gray-950">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Título */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white">
            Perguntas{" "}
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              frequentes
            </span>
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            Tire suas dúvidas sobre o PDV Ótica.
          </p>
        </div>

        {/* Accordion */}
        <div className="space-y-3">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={index}
                className="rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden transition-colors hover:border-gray-700"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="flex items-center justify-between w-full px-6 py-5 text-left"
                >
                  <span className="text-sm font-medium text-white pr-4">{faq.question}</span>
                  <ChevronDown
                    className={`h-5 w-5 text-gray-500 flex-shrink-0 transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <div
                  className={`grid transition-all duration-200 ${
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="px-6 pb-5 text-sm text-gray-400 leading-relaxed">
                      {faq.answer}
                    </p>
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
