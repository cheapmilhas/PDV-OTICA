"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { MessageCircle, Mail, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GradientText } from "@/components/ui/gradient-text";
import { fadeInUp, staggerContainer } from "@/lib/animations";
import { WHATSAPP_URL } from "@/lib/constants";

export function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", store: "", message: "" });
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Integração com webhook/formspree aqui
    setSent(true);
  };

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
            Fale com a{" "}
            <GradientText>nossa equipe.</GradientText>
          </motion.h1>
          <motion.p variants={fadeInUp} className="text-muted text-lg max-w-xl mx-auto">
            Estamos prontos para ajudar você a transformar a gestão da sua ótica.
          </motion.p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 max-w-5xl mx-auto">
          {/* Form */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8"
          >
            {sent ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">✓</div>
                <h3 className="font-heading font-bold text-foreground text-xl mb-2">
                  Mensagem enviada!
                </h3>
                <p className="text-muted">
                  Nossa equipe entrará em contato em breve. Geralmente respondemos em menos de 2 horas.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted mb-1.5 block">Nome *</label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm text-foreground placeholder:text-subtle focus:border-brand-primary focus:outline-none transition-colors"
                      placeholder="Seu nome"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted mb-1.5 block">E-mail *</label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm text-foreground placeholder:text-subtle focus:border-brand-primary focus:outline-none transition-colors"
                      placeholder="seu@email.com"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted mb-1.5 block">WhatsApp</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm text-foreground placeholder:text-subtle focus:border-brand-primary focus:outline-none transition-colors"
                      placeholder="(85) 99999-9999"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted mb-1.5 block">Nome da ótica</label>
                    <input
                      type="text"
                      value={form.store}
                      onChange={(e) => setForm({ ...form, store: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm text-foreground placeholder:text-subtle focus:border-brand-primary focus:outline-none transition-colors"
                      placeholder="Ótica Exemplo"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted mb-1.5 block">Mensagem *</label>
                  <textarea
                    required
                    rows={4}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm text-foreground placeholder:text-subtle focus:border-brand-primary focus:outline-none transition-colors resize-none"
                    placeholder="Como podemos ajudar?"
                  />
                </div>
                <p className="text-xs text-subtle">
                  Ao enviar, você concorda com nossa{" "}
                  <a href="/privacidade" className="text-brand-primary hover:underline">
                    Política de Privacidade
                  </a>
                  .
                </p>
                <Button type="submit" size="lg" className="w-full">
                  Enviar mensagem
                </Button>
              </form>
            )}
          </motion.div>

          {/* Info */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="space-y-6"
          >
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 hover:border-[var(--border-hover)] transition-colors group"
            >
              <div className="shrink-0 h-11 w-11 rounded-xl bg-[#25D366]/10 flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-[#25D366]" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm mb-0.5">WhatsApp</p>
                <p className="text-sm text-muted mb-1">Resposta imediata em horário comercial</p>
                <p className="text-sm text-brand-primary group-hover:underline">Iniciar conversa →</p>
              </div>
            </a>

            <div className="flex gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="shrink-0 h-11 w-11 rounded-xl bg-brand-primary/10 flex items-center justify-center">
                <Mail className="h-5 w-5 text-brand-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm mb-0.5">E-mail</p>
                <p className="text-sm text-muted mb-1">Para assuntos não urgentes</p>
                <a
                  href="mailto:contato@pdvotica.com.br"
                  className="text-sm text-brand-primary hover:underline"
                >
                  contato@pdvotica.com.br
                </a>
              </div>
            </div>

            <div className="flex gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="shrink-0 h-11 w-11 rounded-xl bg-brand-accent/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-brand-accent" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm mb-0.5">Horário de atendimento</p>
                <p className="text-sm text-muted">Segunda a sexta: 8h às 18h</p>
                <p className="text-sm text-muted">Sábado: 8h às 12h</p>
              </div>
            </div>

            <div className="rounded-2xl border border-brand-primary/20 bg-brand-primary/5 p-5">
              <p className="font-semibold text-foreground text-sm mb-1">Quer ver antes de comprar?</p>
              <p className="text-sm text-muted mb-3">
                Agende uma demonstração gratuita e veja o sistema funcionando ao vivo.
              </p>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-brand-primary hover:underline"
              >
                Agendar demonstração →
              </a>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
