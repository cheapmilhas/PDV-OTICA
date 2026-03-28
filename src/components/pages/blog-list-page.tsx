"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Calendar, ArrowRight } from "lucide-react";
import { GradientText } from "@/components/ui/gradient-text";
import { fadeInUp, staggerContainer } from "@/lib/animations";

const posts = [
  {
    slug: "como-organizar-estoque-otica",
    category: "Estoque",
    categoryColor: "text-brand-warning bg-brand-warning/10",
    title: "Como organizar o estoque da sua ótica em 5 passos",
    excerpt:
      "Estoque bagunçado gera perda de venda, produto vencido e capital parado. Veja como organizar de vez com o método FIFO.",
    date: "20 mar 2026",
    readTime: "5 min",
  },
  {
    slug: "como-fidelizar-clientes-otica",
    category: "Marketing",
    categoryColor: "text-brand-accent bg-brand-accent/10",
    title: "7 estratégias de fidelização de clientes para óticas",
    excerpt:
      "Cliente que volta é mais barato do que cliente novo. Veja as estratégias que as óticas de mais sucesso usam para fidelizar.",
    date: "15 mar 2026",
    readTime: "7 min",
  },
  {
    slug: "ordem-de-servico-para-oticas",
    category: "Gestão",
    categoryColor: "text-brand-primary bg-brand-primary/10",
    title: "O que precisa ter numa Ordem de Serviço de ótica?",
    excerpt:
      "A O.S. é o coração da ótica. Entenda o que é obrigatório, o que é recomendado e como automatizar a geração com seu sistema.",
    date: "10 mar 2026",
    readTime: "6 min",
  },
  {
    slug: "livro-de-receitas-vigilancia-sanitaria",
    category: "Fiscal",
    categoryColor: "text-brand-success bg-brand-success/10",
    title: "Livro de Receitas: obrigação que muitas óticas ignoram",
    excerpt:
      "O Decreto 24.492/1934 exige que óticas mantenham um livro de receitas. Entenda a obrigação e como manter digitalmente.",
    date: "5 mar 2026",
    readTime: "4 min",
  },
  {
    slug: "dre-para-otica",
    category: "Financeiro",
    categoryColor: "text-brand-success bg-brand-success/10",
    title: "Como ler o DRE da sua ótica (e o que fazer com ele)",
    excerpt:
      "O Demonstrativo de Resultado do Exercício mostra se sua ótica está dando lucro de verdade. Aprenda a interpretar.",
    date: "1 mar 2026",
    readTime: "8 min",
  },
  {
    slug: "nfe-nfce-para-otica",
    category: "Fiscal",
    categoryColor: "text-brand-success bg-brand-success/10",
    title: "NF-e vs NFC-e: qual emitir na sua ótica?",
    excerpt:
      "Entenda a diferença entre os dois tipos de nota fiscal eletrônica e quando usar cada uma na sua ótica.",
    date: "25 fev 2026",
    readTime: "5 min",
  },
];

export function BlogListPage() {
  return (
    <div className="pt-24 section-padding">
      <div className="container-custom">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="text-center mb-12"
        >
          <motion.h1
            variants={fadeInUp}
            className="font-heading font-bold text-foreground tracking-tight mb-4"
            style={{ fontSize: "var(--text-h1)" }}
          >
            Blog{" "}
            <GradientText>PDV Ótica.</GradientText>
          </motion.h1>
          <motion.p variants={fadeInUp} className="text-muted text-lg max-w-xl mx-auto">
            Dicas práticas de gestão, vendas e fiscal para fazer sua ótica crescer.
          </motion.p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {posts.map((post) => (
            <motion.article
              key={post.slug}
              variants={fadeInUp}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden hover:border-[var(--border-hover)] transition-colors"
            >
              {/* Thumbnail placeholder */}
              <div className="h-40 bg-gradient-to-br from-brand-primary/10 to-brand-accent/10 flex items-center justify-center">
                <span className={`text-xs font-medium px-3 py-1 rounded-full ${post.categoryColor}`}>
                  {post.category}
                </span>
              </div>

              <div className="p-5">
                <h2 className="font-heading font-semibold text-foreground text-base leading-snug mb-2 hover:text-brand-hover transition-colors">
                  <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                </h2>
                <p className="text-sm text-muted leading-relaxed mb-4">{post.excerpt}</p>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xs text-subtle">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {post.date}
                    </span>
                    <span>{post.readTime} de leitura</span>
                  </div>
                  <Link
                    href={`/blog/${post.slug}`}
                    className="text-brand-primary hover:text-brand-hover transition-colors"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
