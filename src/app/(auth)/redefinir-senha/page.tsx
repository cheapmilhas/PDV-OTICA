"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loader2, Eye, EyeOff, CheckCircle2, AlertTriangle } from "lucide-react";

type Strength = "weak" | "medium" | "strong";

function scorePassword(pw: string): Strength | null {
  if (!pw) return null;
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  if (score <= 2) return "weak";
  if (score <= 3) return "medium";
  return "strong";
}

const STRENGTH_META: Record<
  Strength,
  { label: string; bars: number; barClass: string; textClass: string }
> = {
  weak: {
    label: "Senha fraca",
    bars: 1,
    barClass: "bg-destructive",
    textClass: "text-destructive",
  },
  medium: {
    label: "Senha média",
    bars: 2,
    barClass: "bg-amber-500",
    textClass: "text-amber-600",
  },
  strong: {
    label: "Senha forte",
    bars: 3,
    barClass: "bg-emerald-500",
    textClass: "text-emerald-600",
  },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#EAF0FB] via-white to-[#E6FAFF] p-4">
      <div className="w-full max-w-md">
        <Card className="w-full border-slate-200/80 shadow-xl shadow-slate-900/[0.06]">
          {children}
        </Card>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="mx-auto">
      <Image
        src="/vis-logo.png"
        alt="Vis"
        width={132}
        height={44}
        priority
        style={{ height: 44, width: "auto" }}
      />
    </div>
  );
}

export default function RedefinirSenhaPage() {
  const [token, setToken] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // SEGURANÇA: lê o token da query UMA vez no mount, guarda em memória e limpa
  // a URL imediatamente (evita vazar via referrer/histórico/cache).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    setToken(t && t.length > 0 ? t : null);
    window.history.replaceState(null, "", window.location.pathname);
    setTokenReady(true);
  }, []);

  const strength = scorePassword(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("A senha deve ter ao menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/redefinir-senha", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        setDone(true);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "Link inválido ou expirado.");
    } catch {
      setError("Não foi possível redefinir a senha. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  // Estado de carregamento inicial (antes de ler a URL) — evita flash.
  if (!tokenReady) {
    return (
      <Shell>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
        </CardContent>
      </Shell>
    );
  }

  // Sem token → link inválido/expirado.
  if (!token) {
    return (
      <Shell>
        <CardHeader className="space-y-4 text-center">
          <Logo />
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500" aria-hidden="true" />
            <h1 className="text-lg font-semibold text-slate-900">
              Link inválido ou expirado
            </h1>
            <p className="text-sm text-muted-foreground">
              Este link de redefinição não é mais válido. Solicite um novo para
              continuar.
            </p>
          </div>
          <Button
            asChild
            className="w-full text-white hover:opacity-95"
            style={{ background: "linear-gradient(135deg, #2E6BFF 0%, #22C3E6 100%)" }}
          >
            <Link href="/esqueci-senha">Solicitar novo link</Link>
          </Button>
        </CardContent>
      </Shell>
    );
  }

  // Sucesso.
  if (done) {
    return (
      <Shell>
        <CardHeader className="space-y-4 text-center">
          <Logo />
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden="true" />
            <h1 className="text-lg font-semibold text-slate-900">
              Senha alterada com sucesso!
            </h1>
            <p className="text-sm text-muted-foreground">
              Sua senha foi atualizada. Você já pode entrar com a nova senha.
            </p>
          </div>
          <Button
            asChild
            className="w-full text-white hover:opacity-95"
            style={{ background: "linear-gradient(135deg, #2E6BFF 0%, #22C3E6 100%)" }}
          >
            <Link href="/login">Ir para o login</Link>
          </Button>
        </CardContent>
      </Shell>
    );
  }

  // Formulário.
  return (
    <Shell>
      <CardHeader className="space-y-4 text-center">
        <Logo />
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Definir nova senha
          </h1>
          <p className="text-sm text-muted-foreground">
            Escolha uma senha forte para proteger sua conta
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="password">Nova senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                autoFocus
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                aria-invalid={error ? true : undefined}
                className="pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>

            {strength && (
              <div className="space-y-1">
                <div className="flex gap-1" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full transition-colors motion-reduce:transition-none ${
                        i < STRENGTH_META[strength].bars
                          ? STRENGTH_META[strength].barClass
                          : "bg-slate-200"
                      }`}
                    />
                  ))}
                </div>
                <p className={`text-xs font-medium ${STRENGTH_META[strength].textClass}`}>
                  {STRENGTH_META[strength].label}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmar nova senha</Label>
            <div className="relative">
              <Input
                id="confirm"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={isLoading}
                aria-invalid={error ? true : undefined}
                className="pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? "Ocultar senha" : "Mostrar senha"}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
              >
                {showConfirm ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full text-white hover:opacity-95"
            style={{ background: "linear-gradient(135deg, #2E6BFF 0%, #22C3E6 100%)" }}
            disabled={isLoading}
          >
            {isLoading && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            {isLoading ? "Salvando…" : "Salvar nova senha"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary hover:underline">
            Voltar ao login
          </Link>
        </p>
      </CardContent>
    </Shell>
  );
}
