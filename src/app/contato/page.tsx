"use client";

import { useState } from "react";
import { Header } from "@/components/landing/header";
import { Footer } from "@/components/landing/footer";
import { Phone, Mail, MapPin, Clock, MessageSquare, Loader2, CheckCircle } from "lucide-react";

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
    <div className="bg-gray-950 min-h-screen">
      <Header />

      <section className="pt-32 pb-20 md:pb-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-3xl md:text-4xl font-bold text-white">
              Fale{" "}
              <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                com a gente
              </span>
            </h1>
            <p className="mt-4 text-lg text-gray-400 max-w-xl mx-auto">
              Quer saber mais sobre o PDV Ótica? Preencha o formulário ou entre em contato diretamente.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 max-w-5xl mx-auto">
            {/* Formulário */}
            <div className="lg:col-span-3">
              <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-6 md:p-8">
                {sent ? (
                  <div className="text-center py-12">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-white mb-2">Mensagem enviada!</h3>
                    <p className="text-gray-400">Entraremos em contato em breve. Obrigado pelo interesse!</p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5">
                    {error && (
                      <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
                        {error}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">
                          Nome <span className="text-red-400">*</span>
                        </label>
                        <input
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          placeholder="Seu nome"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">
                          Email <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          placeholder="seu@email.com"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Telefone</label>
                        <input
                          value={form.phone}
                          onChange={(e) => setForm({ ...form, phone: e.target.value })}
                          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          placeholder="(85) 99999-9999"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Nome da ótica</label>
                        <input
                          value={form.companyName}
                          onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          placeholder="Ótica Exemplo"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1.5">
                        Mensagem <span className="text-red-400">*</span>
                      </label>
                      <textarea
                        value={form.message}
                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                        rows={4}
                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                        placeholder="Como podemos ajudar?"
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl hover:from-indigo-500 hover:to-purple-500 transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50"
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
              <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-6">
                <h3 className="text-base font-semibold text-white mb-5">Contato direto</h3>
                <ul className="space-y-5">
                  <li>
                    <a
                      href="https://wa.me/5585999999999"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-3 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      <Phone className="h-5 w-5 text-indigo-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-gray-300">WhatsApp</p>
                        <p>(85) 99999-9999</p>
                      </div>
                    </a>
                  </li>
                  <li>
                    <a
                      href="mailto:contato@pdvotica.com"
                      className="flex items-start gap-3 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      <Mail className="h-5 w-5 text-indigo-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-gray-300">Email</p>
                        <p>contato@pdvotica.com</p>
                      </div>
                    </a>
                  </li>
                  <li className="flex items-start gap-3 text-sm text-gray-400">
                    <MapPin className="h-5 w-5 text-indigo-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-gray-300">Endereço</p>
                      <p>Fortaleza, CE — Brasil</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3 text-sm text-gray-400">
                    <Clock className="h-5 w-5 text-indigo-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-gray-300">Horário</p>
                      <p>Seg — Sex, 8h às 18h</p>
                    </div>
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl border border-gray-800 bg-gradient-to-br from-indigo-600/10 to-purple-600/10 p-6">
                <h3 className="text-base font-semibold text-white mb-2">Teste grátis</h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  Não precisa esperar! Inicie seu teste grátis de 14 dias agora mesmo com acesso completo a todas as funcionalidades.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
