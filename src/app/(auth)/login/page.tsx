"use client";

import { useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Glasses, Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
          description: "Email ou senha incorretos",
        });
      } else {
        // Forçar reload completo para garantir nova sessão
        window.location.href = "/dashboard";
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary">
            <Glasses className="h-8 w-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">PDV Ótica</CardTitle>
          <CardDescription>
            Entre com suas credenciais para acessar o sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
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
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Entrar
            </Button>
          </form>

          <Button
            type="button"
            variant="outline"
            className="mt-4 w-full"
            onClick={handleClearSession}
            disabled={isClearing}
          >
            {isClearing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {!isClearing && <Trash2 className="mr-2 h-4 w-4" />}
            Limpar Sessão Anterior
          </Button>

          <div className="mt-6 rounded-lg bg-muted p-4 text-sm space-y-2">
            <p className="font-semibold text-foreground">Credenciais de teste:</p>
            <div>
              <p className="text-xs text-muted-foreground font-medium">ADMIN:</p>
              <p className="text-muted-foreground">admin@pdvotica.com / admin123</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">VENDEDOR:</p>
              <p className="text-muted-foreground">vendedor@pdvotica.com / vendedor123</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
