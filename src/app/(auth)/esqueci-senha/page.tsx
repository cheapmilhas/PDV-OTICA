"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loader2, MailCheck } from "lucide-react";

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await fetch("/api/auth/esqueci-senha", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Endpoint é sempre 200 genérico; mesmo em falha de rede mostramos o
      // mesmo estado para não revelar existência de conta.
    } finally {
      setIsLoading(false);
      setSent(true);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#EAF0FB] via-white to-[#E6FAFF] p-4">
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
                Recuperar acesso
              </h1>
              <p className="text-sm text-muted-foreground">
                {sent
                  ? "Verifique seu e-mail para continuar"
                  : "Informe seu e-mail e enviaremos um link de recuperação"}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-5">
                <div className="flex flex-col items-center gap-3 text-center">
                  <MailCheck
                    className="h-10 w-10 text-emerald-600"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-slate-700">
                    Se houver uma conta com esse e-mail, enviamos um link de
                    recuperação em alguns minutos. Confira também o spam/lixo
                    eletrônico.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Contas que usam nome de usuário (login interno) não recebem
                    redefinição por e-mail.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setSent(false);
                    setEmail("");
                  }}
                >
                  Solicitar novo link
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Seu e-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    placeholder="voce@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full text-white hover:opacity-95"
                  style={{
                    background:
                      "linear-gradient(135deg, #2E6BFF 0%, #22C3E6 100%)",
                  }}
                  disabled={isLoading}
                >
                  {isLoading && (
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {isLoading ? "Enviando…" : "Enviar link"}
                </Button>
              </form>
            )}

            <p className="mt-6 text-center text-sm text-muted-foreground">
              <Link
                href="/login"
                className="font-medium text-primary hover:underline"
              >
                Voltar ao login
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
