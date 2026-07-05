"use client";

import { useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import { useToast } from "@/hooks/use-toast";
import { REGISTER_URL, WHATSAPP_NUMBER } from "@/lib/constants";

const FORGOT_PASSWORD_WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  "Olá! Esqueci minha senha de acesso ao Vis e preciso de ajuda."
)}`;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
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
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto mb-1">
            <Image
              src="/vis-logo.png"
              alt="Vis"
              width={132}
              height={44}
              priority
              style={{ height: 44, width: "auto" }}
            />
          </div>
          <CardDescription>
            Entre com suas credenciais para acessar o sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Login</Label>
              <Input
                id="email"
                type="text"
                placeholder="Seu login"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                disabled={isLoading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                disabled={isLoading}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full text-white hover:opacity-95"
              style={{ background: "linear-gradient(135deg, #2E6BFF 0%, #22C3E6 100%)" }}
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Entrar
            </Button>
          </form>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            <a
              href={FORGOT_PASSWORD_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground hover:underline"
            >
              Esqueci minha senha
            </a>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Ainda não tem conta?{" "}
            <Link href={REGISTER_URL} className="font-medium text-primary hover:underline">
              Criar conta grátis
            </Link>
          </p>

          <div className="mt-6 border-t pt-4 text-center">
            <button
              type="button"
              onClick={handleClearSession}
              disabled={isClearing}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {isClearing ? "Limpando…" : "Problemas para entrar? Limpar sessão anterior"}
            </button>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
