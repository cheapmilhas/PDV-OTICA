"use client";

import { useState } from "react";
import { Loader2, Lock, Eye, EyeOff } from "lucide-react";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mfaToken, setMfaToken] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, mfaToken: mfaToken || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Q8.3.1: backend pede o 2º fator — revela o campo do código na mesma tela.
        if (data.mfaRequired) {
          setMfaRequired(true);
          // Só mostra erro se o usuário JÁ tinha digitado um código (código errado).
          setError(mfaToken ? data.error || "Código de verificação inválido" : "");
          return;
        }
        setError(data.error || "Email ou senha inválidos");
        return;
      }

      // Hard redirect para garantir que o cookie de sessão seja lido pelo servidor.
      window.location.href = "/admin";
    } catch {
      setError("Erro ao fazer login. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm animate-fade-up">
        {/* Marca */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center shadow-card mb-4">
            <Lock className="w-5 h-5 text-primary-foreground" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">Vis</h1>
          <p className="text-sm text-muted-foreground mt-1">Portal de administração</p>
        </div>

        {/* Card do formulário */}
        <form
          onSubmit={handleSubmit}
          className="bg-card rounded-xl border border-border shadow-card p-6"
        >
          <div className="space-y-4">
            <div>
              <label
                htmlFor="admin-email"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                Email
              </label>
              <input
                id="admin-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow"
                placeholder="admin@pdvotica.com.br"
                required
                autoFocus
                disabled={loading}
              />
            </div>

            <div>
              <label
                htmlFor="admin-password"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                Senha
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 pr-11 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow"
                  placeholder="••••••••"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {mfaRequired && (
              <div className="animate-fade-in">
                <label
                  htmlFor="admin-mfa"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  Código de verificação
                </label>
                <input
                  id="admin-mfa"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={mfaToken}
                  onChange={(e) => setMfaToken(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-background border border-input rounded-lg text-foreground tracking-[0.4em] text-center placeholder:text-muted-foreground placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow"
                  placeholder="000000"
                  autoFocus
                  disabled={loading}
                />
                <p className="text-muted-foreground text-xs mt-1.5">
                  Digite o código do seu app autenticador (ou um código de recuperação).
                </p>
              </div>
            )}

            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed text-primary-foreground font-medium rounded-lg transition-colors"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {loading ? "Entrando…" : mfaRequired ? "Verificar" : "Entrar"}
            </button>
          </div>
        </form>

        <p className="text-muted-foreground text-center text-xs mt-6">
          Acesso restrito a administradores do sistema
        </p>
      </div>
    </main>
  );
}
