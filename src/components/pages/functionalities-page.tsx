"use client";

import { motion } from "framer-motion";
import {
  ShoppingCart, Package, DollarSign, Users,
  FileText, FlaskConical, MessageSquare, BarChart3,
  CheckCircle,
} from "lucide-react";
import { GradientText } from "@/components/ui/gradient-text";
import { staggerContainer, fadeInUp, slideInLeft, slideInRight, viewportConfig } from "@/lib/animations";
import Link from "next/link";
import { REGISTER_URL } from "@/lib/constants";

const modules = [
  {
    icon: ShoppingCart,
    color: "text-brand-primary",
    bg: "bg-brand-primary/10",
    title: "PDV e Vendas",
    description:
      "Registre vendas com agilidade. A O.S. é gerada automaticamente com os dados da receita, logo da ótica e informações do cliente. Impressão personalizada e controle total por usuário.",
    features: [
      "O.S. automática com logo e dados da ótica",
      "Múltiplas formas de pagamento",
      "Controle de descontos com limite por vendedor",
      "Histórico completo por usuário, data e hora",
      "Venda por código de barras ou busca",
      "Sangria e suprimento de caixa",
    ],
  },
  {
    icon: Package,
    color: "text-brand-warning",
    bg: "bg-brand-warning/10",
    title: "Controle de Estoque",
    description:
      "Entradas por XML do fornecedor, etiquetas automáticas, alertas de estoque mínimo e controle multi-filial. Saiba exatamente o que tem em cada loja em tempo real.",
    features: [
      "Entrada por XML de NF-e do fornecedor",
      "Etiquetas com código de barras e QR Code",
      "Estoque mínimo com alertas",
      "Giro de estoque por período",
      "Transferência entre filiais",
      "Inventário com conferência",
    ],
  },
  {
    icon: DollarSign,
    color: "text-brand-success",
    bg: "bg-brand-success/10",
    title: "Financeiro Completo",
    description:
      "DRE, fluxo de caixa, contas a pagar e receber, boleto sem remessa e comissões configuráveis. Tudo que você precisa para saber se sua ótica está dando lucro.",
    features: [
      "DRE mensal e anual",
      "Fluxo de caixa projetado",
      "Contas a pagar e receber",
      "Boleto bancário sem remessa/retorno",
      "Comissões por vendedor, produto ou marca",
      "Conciliação bancária",
    ],
  },
  {
    icon: Users,
    color: "text-brand-accent",
    bg: "bg-brand-accent/10",
    title: "Clientes e Receituários",
    description:
      "Cadastro completo com histórico de receitas e compras. Alertas de receita vencendo e integração com WhatsApp para pós-venda automático.",
    features: [
      "Ficha completa do cliente",
      "Histórico de receitas e compras",
      "Alertas de receita vencendo",
      "Livro de receitas (Decreto 24.492/1934)",
      "Fotos de documentos e receitas",
      "Busca rápida por nome, CPF ou telefone",
    ],
  },
  {
    icon: FileText,
    color: "text-brand-primary",
    bg: "bg-brand-primary/10",
    title: "Emissão Fiscal",
    description:
      "NF-e, NFC-e, SAT/MFe e envio automático ao contador. Certificado digital A1 e A3. Conformidade fiscal completa sem complicação.",
    features: [
      "NF-e (modelo 55)",
      "NFC-e (modelo 65) — frente de caixa",
      "SAT (SP) e MFe (CE)",
      "Envio automático XML ao contador",
      "Certificado digital A1 e A3",
      "SINTEGRA e SPED",
    ],
  },
  {
    icon: FlaskConical,
    color: "text-brand-accent",
    bg: "bg-brand-accent/10",
    title: "Integração com Laboratórios",
    description:
      "Envie O.S. diretamente ao laboratório, acompanhe o status em tempo real e notifique o cliente automaticamente quando o óculos estiver pronto.",
    features: [
      "Envio de O.S. ao laboratório",
      "Acompanhamento de status em tempo real",
      "Notificação automática ao cliente",
      "Histórico de pedidos por laboratório",
      "Prazo de entrega por laboratório",
      "Controle de lentes em processamento",
    ],
  },
  {
    icon: MessageSquare,
    color: "text-brand-success",
    bg: "bg-brand-success/10",
    title: "Pós-venda e Marketing",
    description:
      "Fidelização automática via WhatsApp. Lembretes de receita vencendo, aniversários e campanhas segmentadas para trazer clientes de volta.",
    features: [
      "WhatsApp automático de pós-venda",
      "Lembretes de receita vencendo",
      "Parabéns no aniversário",
      "Campanhas segmentadas",
      "Histórico de comunicações",
      "Taxa de retorno por campanha",
    ],
  },
  {
    icon: BarChart3,
    color: "text-brand-warning",
    bg: "bg-brand-warning/10",
    title: "Relatórios e BI",
    description:
      "Dashboard em tempo real com os principais indicadores. Relatórios de vendas por vendedor, produto, período e muito mais. Exporte em Excel ou PDF.",
    features: [
      "Dashboard em tempo real",
      "Vendas por vendedor e produto",
      "Ticket médio e margem",
      "Clientes mais valiosos",
      "Indicadores de inadimplência",
      "Exportação Excel e PDF",
    ],
  },
];

export function FunctionalitiesPage() {
  return (
    <div className="pt-24">
      {/* Hero */}
      <section className="section-padding">
        <div className="container-custom text-center">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <motion.h1
              variants={fadeInUp}
              className="font-heading font-bold text-foreground tracking-tight mb-4"
              style={{ fontSize: "var(--text-h1)" }}
            >
              Tudo que sua ótica precisa.{" "}
              <GradientText>Integrado.</GradientText>
            </motion.h1>
            <motion.p variants={fadeInUp} className="text-muted text-lg max-w-2xl mx-auto mb-8">
              Cada módulo foi desenvolvido pensando no dia a dia da ótica. Simples de usar,
              poderoso nos resultados.
            </motion.p>
            <motion.div variants={fadeInUp} className="flex flex-wrap justify-center gap-2">
              {modules.map((m) => (
                <a
                  key={m.title}
                  href={`#${m.title.toLowerCase().replace(/\s+/g, "-")}`}
                  className="text-sm px-3 py-1.5 rounded-full border border-[var(--border)] text-muted hover:text-foreground hover:border-[var(--border-hover)] transition-colors"
                >
                  {m.title}
                </a>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Modules */}
      {modules.map((mod, idx) => (
        <section
          key={mod.title}
          id={mod.title.toLowerCase().replace(/\s+/g, "-")}
          className={`section-padding ${idx % 2 === 0 ? "" : "bg-[var(--surface)]"}`}
        >
          <div className="container-custom">
            <div
              className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center ${
                idx % 2 === 1 ? "lg:flex-row-reverse" : ""
              }`}
            >
              {/* Text */}
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={viewportConfig}
                variants={idx % 2 === 0 ? slideInLeft : slideInRight}
                className={idx % 2 === 1 ? "lg:order-2" : ""}
              >
                <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${mod.bg} mb-6`}>
                  <mod.icon className={`h-6 w-6 ${mod.color}`} />
                </div>
                <h2 className="font-heading font-bold text-foreground text-2xl md:text-3xl mb-4">
                  {mod.title}
                </h2>
                <p className="text-muted leading-relaxed mb-6">{mod.description}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {mod.features.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 shrink-0 text-brand-success" />
                      <span className="text-muted">{f}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Visual placeholder */}
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={viewportConfig}
                variants={idx % 2 === 0 ? slideInRight : slideInLeft}
                className={idx % 2 === 1 ? "lg:order-1" : ""}
              >
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 aspect-video flex items-center justify-center">
                  <div className="text-center">
                    <div className={`inline-flex h-16 w-16 items-center justify-center rounded-2xl ${mod.bg} mb-4`}>
                      <mod.icon className={`h-8 w-8 ${mod.color}`} />
                    </div>
                    <p className="text-sm text-subtle">Screenshot do módulo {mod.title}</p>
                    <p className="text-xs text-subtle mt-1">em breve</p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>
      ))}

      {/* CTA */}
      <section className="section-padding">
        <div className="container-custom text-center">
          <h2 className="font-heading font-bold text-foreground text-2xl md:text-3xl mb-4">
            Pronto para experimentar?
          </h2>
          <p className="text-muted mb-8 max-w-md mx-auto">
            14 dias grátis. Todos os módulos incluídos. Sem cartão de crédito.
          </p>
          <Link
            href={REGISTER_URL}
            target="_blank"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-brand-primary text-white font-semibold hover:bg-brand-hover transition-colors"
          >
            Começar gratuitamente
          </Link>
        </div>
      </section>
    </div>
  );
}
