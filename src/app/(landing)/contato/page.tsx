"use client";

import { useState } from "react";
import { Phone, Mail, MapPin, Clock, MessageSquare, Loader2, CheckCircle } from "lucide-react";

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
          <p className="mt-4 text-lg max-w-xl mx-auto" style={{ color: "var(--lp-muted)" }}>
            Quer ver o Vis funcionando na sua ótica? Peça uma demonstração ou tire
            suas dúvidas — respondemos rápido.
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
                        Nome da ótica
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
                <li>
                  <a
                    href="https://wa.me/5585999999999"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 text-sm transition-colors"
                    style={{ color: "var(--lp-muted)" }}
                  >
                    <Phone className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: "var(--brand-primary)" }} />
                    <div>
                      <p className="font-medium" style={{ color: "var(--lp-foreground)" }}>WhatsApp</p>
                      <p>(85) 99999-9999</p>
                    </div>
                  </a>
                </li>
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
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
