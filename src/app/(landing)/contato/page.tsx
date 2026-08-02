"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Phone,
  Mail,
  MapPin,
  Clock,
  MessageSquare,
  Loader2,
  CheckCircle,
  ArrowRight,
} from "lucide-react";
import {
  WHATSAPP_ENABLED,
  WHATSAPP_NUMBER,
  WHATSAPP_URL,
  formatWhatsAppDisplay,
} from "@/lib/constants";

const inputClass =
  "w-full px-4 py-3 rounded-xl text-sm bg-[var(--lp-surface)] border border-[var(--lp-border-hover)] text-[var(--lp-foreground)] placeholder-[var(--lp-subtle)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[color:rgba(46,107,255,0.15)] transition-colors";

export default function ContatoPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", companyName: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erro ao enviar mensagem");
        return;
      }

      setSent(true);
    } catch {
      setError("Erro ao enviar mensagem. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="pt-32 pb-20 md:pb-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h1
            className="font-heading font-extrabold tracking-tight"
            style={{ fontSize: "var(--text-h1)", color: "var(--lp-foreground)" }}
          >
            Fale{" "}
            <span
              style={{
                background: "var(--gradient-brand-vivid)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              com a Vis
            </span>
          </h1>
          {/* Neutra: esta página é o destino do "Deixar meu contato" da home
              institucional, que serve os DOIS produtos. Falar em "sua ótica"
              fazia o lead de clínica achar que estava na página errada. */}
          <p className="mt-4 text-lg max-w-xl mx-auto" style={{ color: "var(--lp-muted)" }}>
            Quer ver o Vis funcionando na sua ótica ou na sua clínica? Peça uma
            demonstração ou tire suas dúvidas — respondemos rápido.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 max-w-5xl mx-auto">
          {/* Formulário */}
          <div className="lg:col-span-3">
            <div
              className="rounded-2xl p-6 md:p-8"
              style={{ border: "1px solid var(--lp-border)", background: "var(--lp-surface)" }}
            >
              {sent ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4" style={{ color: "var(--brand-success)" }} />
                  <h3 className="text-xl font-bold mb-2" style={{ color: "var(--lp-foreground)" }}>
                    Mensagem enviada!
                  </h3>
                  <p style={{ color: "var(--lp-muted)" }}>
                    Entraremos em contato em breve. Obrigado pelo interesse!
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  {error && (
                    <div
                      className="p-3 rounded-lg text-sm"
                      style={{
                        background: "rgba(220,38,38,0.08)",
                        border: "1px solid rgba(220,38,38,0.25)",
                        color: "#DC2626",
                      }}
                    >
                      {error}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--lp-foreground)" }}>
                        Nome <span style={{ color: "#DC2626" }}>*</span>
                      </label>
                      <input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className={inputClass}
                        placeholder="Seu nome"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--lp-foreground)" }}>
                        Email <span style={{ color: "#DC2626" }}>*</span>
                      </label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className={inputClass}
                        placeholder="seu@email.com"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--lp-foreground)" }}>
                        Telefone
                      </label>
                      <input
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        className={inputClass}
                        placeholder="(85) 99999-9999"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--lp-foreground)" }}>
                        Nome da ótica ou clínica
                      </label>
                      <input
                        value={form.companyName}
                        onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                        className={inputClass}
                        placeholder="Ótica Exemplo"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--lp-foreground)" }}>
                      Mensagem <span style={{ color: "#DC2626" }}>*</span>
                    </label>
                    <textarea
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      rows={4}
                      className={`${inputClass} resize-none`}
                      placeholder="Como podemos ajudar?"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-bold text-white rounded-xl transition-all disabled:opacity-50"
                    style={{
                      background: "var(--gradient-brand-vivid)",
                      boxShadow: "0 4px 20px var(--brand-glow)",
                    }}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MessageSquare className="h-4 w-4" />
                    )}
                    Enviar mensagem
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Contato direto */}
          <div className="lg:col-span-2 space-y-6">
            <div
              className="rounded-2xl p-6"
              style={{ border: "1px solid var(--lp-border)", background: "var(--lp-surface)" }}
            >
              <h3 className="text-base font-semibold mb-5" style={{ color: "var(--lp-foreground)" }}>
                Contato direto
              </h3>
              <ul className="space-y-5">
                {/* Enquanto não há número de vendas, o item some por inteiro:
                    aqui o placeholder era pior que nos botões, porque o número
                    falso aparecia como TEXTO, convidando a ligar. */}
                {WHATSAPP_ENABLED && (
                  <li>
                    <a
                      href={WHATSAPP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-3 text-sm transition-colors"
                      style={{ color: "var(--lp-muted)" }}
                    >
                      <Phone className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: "var(--brand-primary)" }} />
                      <div>
                        <p className="font-medium" style={{ color: "var(--lp-foreground)" }}>WhatsApp</p>
                        <p>{formatWhatsAppDisplay(WHATSAPP_NUMBER)}</p>
                      </div>
                    </a>
                  </li>
                )}
                <li>
                  <a
                    href="mailto:contato@vis.app.br"
                    className="flex items-start gap-3 text-sm transition-colors"
                    style={{ color: "var(--lp-muted)" }}
                  >
                    <Mail className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: "var(--brand-primary)" }} />
                    <div>
                      <p className="font-medium" style={{ color: "var(--lp-foreground)" }}>Email</p>
                      <p>contato@vis.app.br</p>
                    </div>
                  </a>
                </li>
                <li className="flex items-start gap-3 text-sm" style={{ color: "var(--lp-muted)" }}>
                  <MapPin className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: "var(--brand-primary)" }} />
                  <div>
                    <p className="font-medium" style={{ color: "var(--lp-foreground)" }}>Endereço</p>
                    <p>Fortaleza, CE — Brasil</p>
                  </div>
                </li>
                <li className="flex items-start gap-3 text-sm" style={{ color: "var(--lp-muted)" }}>
                  <Clock className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: "var(--brand-primary)" }} />
                  <div>
                    <p className="font-medium" style={{ color: "var(--lp-foreground)" }}>Horário</p>
                    <p>Seg — Sex, 8h às 18h</p>
                  </div>
                </li>
              </ul>
            </div>

            <div
              className="rounded-2xl p-6"
              style={{ border: "1px solid var(--lp-border)", background: "var(--brand-tint)" }}
            >
              <h3 className="text-base font-semibold mb-2" style={{ color: "var(--lp-foreground)" }}>
                Comece grátis
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--lp-muted)" }}>
                Não precisa esperar! Crie sua conta agora e comece a usar o Vis em
                minutos — sem cartão de crédito e sem fidelidade.
              </p>
              {/* O card convidava a criar conta e não oferecia como: dois links,
                  um por produto, porque esta página recebe os dois públicos. */}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Link
                  href="/registro"
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
                  style={{ background: "var(--gradient-brand-vivid)" }}
                >
                  Sou ótica
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
                <Link
                  href="/registro-medical"
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold"
                  style={{
                    background: "var(--lp-surface)",
                    border: "1px solid var(--lp-border-hover)",
                    color: "var(--lp-foreground)",
                  }}
                >
                  Sou clínica
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
