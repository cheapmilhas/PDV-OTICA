"use client";

import { useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loader2, Eye, EyeOff } from "lucide-react";
import Image from "next/image";
import { useToast } from "@/hooks/use-toast";
import { REGISTER_URL, WHATSAPP_NUMBER } from "@/lib/constants";
import { LoginSidePanel } from "./login-side-panel";
import { loginPanelContent } from "./login-panel-content";

const FORGOT_PASSWORD_WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  "Olá! Esqueci minha senha de acesso ao Vis e preciso de ajuda."
)}`;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showTrouble, setShowTrouble] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleClearSession = async () => {
    setIsClearing(true);
    try {
      // Fazer signOut primeiro
      await signOut({ redirect: false });

      // Limpar cookies via API
      await fetch("/api/auth/clear-session");

      toast({
        title: "Sessão limpa!",
        description: "Todos os dados foram apagados. Faça login novamente.",
      });

      // Recarregar página
      window.location.reload();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao limpar sessão",
      });
    } finally {
      setIsClearing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      // SEMPRE fazer signOut antes de novo login para limpar sessão anterior
      await signOut({ redirect: false });

      // Aguardar um momento para garantir que o signOut completou
      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = await signIn("credentials", {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });

      if (result?.error) {
        // Mensagem genérica (não revela se o usuário existe). Erro inline + toast.
        setErrorMessage("Login ou senha incorretos. Verifique e tente novamente.");
        toast({
          variant: "destructive",
          title: "Erro ao fazer login",
          description: "Login ou senha incorretos",
        });
      } else {
        // Redirecionar e forçar refresh da sessão
        router.push("/dashboard");
        router.refresh();
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Ocorreu um erro ao fazer login",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#EAF0FB] via-white to-[#E6FAFF] p-4">
      <div className="flex w-full max-w-5xl items-center justify-center gap-10 lg:justify-between">
        <div className="w-full max-w-md">
          <Card className="w-full border-slate-200/80 shadow-xl shadow-slate-900/[0.06]">
            <CardHeader className="space-y-4 text-center">
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
              <div className="space-y-1.5">
                <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                  Acesse a gestão da sua ótica
                </h1>
                <p className="text-sm text-muted-foreground">
                  Entre com seu login e senha para continuar
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {errorMessage && (
                  <div
                    role="alert"
                    aria-live="assertive"
                    className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                  >
                    {errorMessage}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Login</Label>
                  <Input
                    id="email"
                    type="text"
                    autoComplete="username"
                    autoFocus
                    placeholder="Seu login"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    disabled={isLoading}
                    aria-invalid={errorMessage ? true : undefined}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Senha</Label>
                    <a
                      href={FORGOT_PASSWORD_WHATSAPP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Esqueci minha senha
                    </a>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      disabled={isLoading}
                      aria-invalid={errorMessage ? true : undefined}
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
                </div>
                <Button
                  type="submit"
                  className="w-full text-white hover:opacity-95"
                  style={{ background: "linear-gradient(135deg, #2E6BFF 0%, #22C3E6 100%)" }}
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  {isLoading ? "Entrando…" : "Entrar"}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                Ainda não tem conta?{" "}
                <Link href={REGISTER_URL} className="font-medium text-primary hover:underline">
                  Criar conta grátis
                </Link>
              </p>
            </CardContent>
          </Card>

          <div className="mt-4 text-center">
            {showTrouble ? (
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>Se você já fez login antes e está travado, reinicie o acesso:</p>
                <button
                  type="button"
                  onClick={handleClearSession}
                  disabled={isClearing}
                  className="font-medium text-slate-600 underline hover:text-foreground disabled:opacity-50"
                >
                  {isClearing ? "Reiniciando…" : "Reiniciar acesso"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowTrouble(true)}
                className="text-xs text-muted-foreground/70 hover:text-muted-foreground"
              >
                Problemas para entrar?
              </button>
            )}
          </div>
        </div>
        <LoginSidePanel content={loginPanelContent} />
      </div>
    </div>
  );
}
