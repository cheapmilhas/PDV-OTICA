"use client";

import { GradientText } from "@/components/ui/gradient-text";
import { PricingSection } from "@/components/home/pricing-section";
import { FaqSection } from "@/components/home/faq-section";
import { FinalCta } from "@/components/home/final-cta";
import { motion } from "framer-motion";
import { fadeInUp, staggerContainer } from "@/lib/animations";
import { Check } from "lucide-react";

const comparison = [
  { feature: "PDV e registro de vendas", essencial: true, pro: true, rede: true },
  { feature: "Ordem de Serviço (O.S.)", essencial: true, pro: true, rede: true },
  { feature: "Controle de estoque", essencial: true, pro: true, rede: true },
  { feature: "Cadastro de clientes", essencial: true, pro: true, rede: true },
  { feature: "Caixa e fluxo de caixa", essencial: true, pro: true, rede: true },
  { feature: "Acesso mobile", essencial: true, pro: true, rede: true },
  { feature: "Emissão de NF-e / NFC-e", essencial: false, pro: true, rede: true },
  { feature: "Contas a pagar e receber", essencial: false, pro: true, rede: true },
  { feature: "DRE e relatórios avançados", essencial: false, pro: true, rede: true },
  { feature: "Comissões de vendedores", essencial: false, pro: true, rede: true },
  { feature: "Integração com laboratórios", essencial: false, pro: true, rede: true },
  { feature: "WhatsApp automático", essencial: false, pro: true, rede: true },
  { feature: "Campanhas de pós-venda", essencial: false, pro: true, rede: true },
  { feature: "Múltiplas filiais", essencial: false, pro: false, rede: true },
  { feature: "Transferência entre filiais", essencial: false, pro: false, rede: true },
  { feature: "Visão consolidada da rede", essencial: false, pro: false, rede: true },
  { feature: "Dashboard de BI avançado", essencial: false, pro: false, rede: true },
  { feature: "Usuários ilimitados", essencial: false, pro: false, rede: true },
  { feature: "Gerente de conta dedicado", essencial: false, pro: false, rede: true },
];

export function PricingPage() {
  return (
    <div className="pt-24">
      <section className="section-padding">
        <div className="container-custom text-center">
          <motion.div variants={staggerContainer} initial="hidden" animate="visible">
            <motion.h1
              variants={fadeInUp}
              className="font-heading font-bold text-foreground tracking-tight mb-4"
              style={{ fontSize: "var(--text-h1)" }}
            >
              Planos para todo{" "}
              <GradientText>tamanho de ótica.</GradientText>
            </motion.h1>
            <motion.p variants={fadeInUp} className="text-muted text-lg max-w-xl mx-auto">
              Comece pelo Essencial e escale conforme sua ótica cresce. Sem surpresas.
            </motion.p>
          </motion.div>
        </div>
      </section>

      <PricingSection />

      {/* Comparison table */}
      <section className="section-padding bg-[var(--surface)]">
        <div className="container-custom">
          <h2 className="font-heading font-bold text-foreground text-2xl md:text-3xl text-center mb-10">
            Comparativo completo
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left p-4 text-sm font-semibold text-foreground">Funcionalidade</th>
                  <th className="text-center p-4 text-sm font-semibold text-foreground">Essencial</th>
                  <th className="text-center p-4 text-sm font-semibold text-brand-primary">Profissional</th>
                  <th className="text-center p-4 text-sm font-semibold text-foreground">Rede</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row, i) => (
                  <tr
                    key={row.feature}
                    className={`border-b border-[var(--border)] ${i % 2 === 0 ? "bg-[var(--surface)]" : "bg-[var(--background)]"}`}
                  >
                    <td className="p-4 text-sm text-muted">{row.feature}</td>
                    <td className="p-4 text-center">
                      {row.essencial ? (
                        <Check className="h-4 w-4 text-brand-success mx-auto" />
                      ) : (
                        <span className="text-subtle text-lg">–</span>
                      )}
                    </td>
                    <td className="p-4 text-center bg-brand-primary/5">
                      {row.pro ? (
                        <Check className="h-4 w-4 text-brand-success mx-auto" />
                      ) : (
                        <span className="text-subtle text-lg">–</span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      {row.rede ? (
                        <Check className="h-4 w-4 text-brand-success mx-auto" />
                      ) : (
                        <span className="text-subtle text-lg">–</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <FaqSection />
      <FinalCta />
    </div>
  );
}
