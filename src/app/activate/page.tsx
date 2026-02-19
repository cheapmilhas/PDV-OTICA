"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock, CheckCircle, XCircle, Clock, Eye, EyeOff } from "lucide-react";

function ActivateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [validating, setValidating] = useState(true);
  const [invite, setInvite] = useState<any>(null);
  const [error, setError] = useState("");
  const [errorType, setErrorType] = useState<"invalid" | "expired" | "used" | "">("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Validar token ao carregar
  useEffect(() => {
    if (!token) {
      setError("Token não fornecido");
      setErrorType("invalid");
      setValidating(false);
      return;
    }

    fetch(`/api/auth/validate-invite?token=${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          if (data.error.includes("expirou")) setErrorType("expired");
          else if (data.error.includes("utilizado")) setErrorType("used");
          else setErrorType("invalid");
        } else {
          setInvite(data.invite);
        }
      })
      .catch(() => {
        setError("Erro ao validar convite");
        setErrorType("invalid");
      })
      .finally(() => setValidating(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (password.length < 8) {
      setFormError("Senha deve ter no mínimo 8 caracteres");
      return;
    }

    if (password !== confirmPassword) {
      setFormError("As senhas não conferem");
      return;
    }

    if (!acceptTerms) {
      setFormError("Você precisa aceitar os termos de uso");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, acceptTerms }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao ativar conta");
      }

      router.push("/login?activated=true");
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Estado: Carregando
  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto mb-4" />
          <p className="text-gray-400">Validando convite...</p>
        </div>
      </div>
    );
  }

  // Estado: Erro
  if (error && !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 max-w-md text-center">
          {errorType === "expired" ? (
            <Clock className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          ) : (
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          )}
          <h1 className="text-xl font-bold text-white mb-2">
            {errorType === "expired" ? "Convite Expirado" : "Convite Inválido"}
          </h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <a
            href="/login"
            className="inline-block px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Ir para o login
          </a>
        </div>
      </div>
    );
  }

  // Estado: Formulário de ativação
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Ative sua conta</h1>
          <p className="text-gray-400 mt-2">
            Bem-vindo(a), <span className="text-white">{invite?.name}</span>!
          </p>
          <p className="text-sm text-gray-500">{invite?.company?.tradeName}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded-lg text-sm">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Criar senha</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 pr-10"
                placeholder="Mínimo 8 caracteres"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Confirmar senha</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="w-5 h-5 mt-0.5 rounded border-gray-600 bg-gray-800 text-indigo-500"
            />
            <span className="text-sm text-gray-400">
              Li e aceito os{" "}
              <a href="/termos" className="text-indigo-400 hover:underline">
                Termos de Uso
              </a>{" "}
              e a{" "}
              <a href="/privacidade" className="text-indigo-400 hover:underline">
                Política de Privacidade
              </a>
            </span>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Ativar minha conta
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ActivatePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-950">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      }
    >
      <ActivateContent />
    </Suspense>
  );
}
