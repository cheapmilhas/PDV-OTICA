"use client";

import { motion } from "framer-motion";
import { ArrowRight, CheckCircle, Shield, Clock, Users, Database } from "lucide-react";
import Link from "next/link";
import { GradientText } from "@/components/ui/gradient-text";
import { fadeInUp, staggerContainer, viewportConfig } from "@/lib/animations";
import { REGISTER_URL, WHATSAPP_URL } from "@/lib/constants";
import { Button } from "@/components/ui/button";

const steps = [
  { day: "Dia 1", title: "Contrato e acesso", description: "Assinatura do contrato e criação do acesso ao sistema." },
  { day: "Dias 1-2", title: "Importação dos dados", description: "Nossa equipe importa seus clientes, produtos e histórico do sistema anterior." },
  { day: "Dias 3-4", title: "Configuração", description: "Configuramos o sistema conforme as necessidades da sua ótica: planos, comissões, NF-e." },
  { day: "Dia 5-6", title: "Treinamento da equipe", description: "Treinamento online ou presencial para toda a equipe. Vídeos de apoio inclusos." },
  { day: "Dia 7", title: "Go-live!", description: "Sua ótica entra em operação completa no PDV Ótica. Suporte intensivo nos primeiros 30 dias." },
];

const guarantees = [
  { icon: Database, title: "Zero perda de dados", description: "Todos os seus clientes, produtos, receitas e histórico são migrados com segurança." },
  { icon: Clock, title: "Em até 7 dias", description: "Do contrato ao go-live em uma semana. Sem interromper sua operação." },
  { icon: Users, title: "Time de implantação", description: "Um especialista acompanha todo o processo, do início ao fim." },
  { icon: Shield, title: "Garantia de 30 dias", description: "Suporte intensivo no primeiro mês. Você não fica na mão." },
];

export function MigrationPage() {
  return (
    <div className="pt-24">
      {/* Hero */}
      <section className="section-padding">
        <div className="container-custom">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="max-w-3xl"
          >
            <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 text-xs font-medium text-brand-success bg-brand-success/10 border border-brand-success/20 rounded-full px-3 py-1 mb-6">
              <CheckCircle className="h-3 w-3" />
              Migração sem estresse
            </motion.div>
            <motion.h1
              variants={fadeInUp}
              className="font-heading font-bold text-foreground tracking-tight mb-4"
              style={{ fontSize: "var(--text-h1)" }}
            >
              Migre do seu sistema atual{" "}
              <GradientText>sem perder um dado sequer.</GradientText>
            </motion.h1>
            <motion.p variants={fadeInUp} className="text-muted text-lg leading-relaxed mb-8">
              Sabemos que trocar de sistema dá medo. Por isso nossa equipe cuida de tudo —
              desde a importação dos dados até o treinamento da sua equipe.
            </motion.p>
            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-3">
              <Button size="lg" asChild>
                <Link href={REGISTER_URL} target="_blank">
                  Começar migração
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
              <Button variant="secondary" size="lg" asChild>
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                  Falar sobre minha situação
                </a>
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Timeline */}
      <section className="section-padding bg-[var(--surface)]">
        <div className="container-custom">
          <h2 className="font-heading font-bold text-foreground text-2xl md:text-3xl mb-10 text-center">
            Em 7 dias, sua ótica está{" "}
            <GradientText>no novo sistema.</GradientText>
          </h2>
          <div className="max-w-2xl mx-auto space-y-4">
            {steps.map((s, i) => (
              <motion.div
                key={s.day}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={viewportConfig}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="flex gap-4"
              >
                <div className="flex flex-col items-center">
                  <div className="h-8 w-8 rounded-full bg-brand-primary flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {i + 1}
                  </div>
                  {i < steps.length - 1 && (
                    <div className="w-px flex-1 bg-brand-primary/20 my-1" />
                  )}
                </div>
                <div className="pb-6">
                  <p className="text-xs font-medium text-brand-primary mb-0.5">{s.day}</p>
                  <h3 className="font-semibold text-foreground mb-1">{s.title}</h3>
                  <p className="text-sm text-muted">{s.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Guarantees */}
      <section className="section-padding">
        <div className="container-custom">
          <h2 className="font-heading font-bold text-foreground text-2xl md:text-3xl mb-10 text-center">
            Nossas garantias
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {guarantees.map((g) => (
              <motion.div
                key={g.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={viewportConfig}
                transition={{ duration: 0.4 }}
                className="text-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-primary/10 mb-4">
                  <g.icon className="h-6 w-6 text-brand-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{g.title}</h3>
                <p className="text-sm text-muted">{g.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="section-padding bg-[var(--surface)]">
        <div className="container-custom max-w-2xl text-center">
          <blockquote className="text-lg text-foreground leading-relaxed mb-6">
            &ldquo;Eu usava outro sistema há 5 anos e ficava com medo de perder tudo. A equipe do
            PDV Ótica migrou todos os meus clientes, receitas e estoque em 2 dias. Não perdi
            absolutamente nada. Recomendo de olhos fechados.&rdquo;
          </blockquote>
          <div className="flex items-center justify-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-brand-primary to-brand-accent flex items-center justify-center text-white font-bold text-sm">
              J
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">Juliana Costa</p>
              <p className="text-xs text-muted">Ótica Moderna · Natal, RN</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
