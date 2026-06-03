"use client";

import { useState } from "react";

type Step = "idle" | "enrolling" | "verifying" | "done";

interface MfaSetupProps {
  initialEnabled: boolean;
}

/**
 * Q8.3.1: cadastro do MFA (TOTP) do admin. Fluxo:
 * 1. "Ativar 2FA" → POST /enroll → mostra QR Code.
 * 2. Admin escaneia no app e digita o 1º código → POST /verify.
 * 3. Sucesso → mostra os códigos de recuperação (uma única vez).
 */
export default function MfaSetup({ initialEnabled }: MfaSetupProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [step, setStep] = useState<Step>("idle");
  const [qr, setQr] = useState<string | null>(null);
  const [manualKey, setManualKey] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function startEnroll() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/auth/mfa/enroll", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Falha ao iniciar o cadastro.");
        return;
      }
      setQr(data.qrDataUrl);
      setManualKey(data.manualEntryKey);
      setStep("enrolling");
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmToken(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Código inválido.");
        return;
      }
      setRecoveryCodes(data.recoveryCodes ?? []);
      setEnabled(true);
      setStep("done");
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (enabled && step !== "done") {
    return (
      <div className="rounded-lg border border-green-800 bg-green-900/30 p-4 text-green-300">
        <p className="font-medium">✓ Verificação em duas etapas está ATIVA.</p>
        <p className="text-sm text-green-400/80 mt-1">
          Seu login exige o código do app autenticador.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {step === "idle" && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-gray-300 mb-3">
            Adicione uma camada extra de segurança ao seu login com um app
            autenticador (Google Authenticator, Authy, Microsoft Authenticator).
          </p>
          <button
            onClick={startEnroll}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800 text-white rounded-lg"
          >
            {loading ? "Gerando..." : "Ativar verificação em duas etapas"}
          </button>
        </div>
      )}

      {step === "enrolling" && qr && (
        <form onSubmit={confirmToken} className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
          <p className="text-gray-300 text-sm">
            1. Escaneie o QR Code no seu app autenticador:
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR Code MFA" className="w-48 h-48 bg-white p-2 rounded" />
          {manualKey && (
            <p className="text-gray-500 text-xs break-all">
              Ou digite manualmente: <span className="font-mono text-gray-400">{manualKey}</span>
            </p>
          )}
          <p className="text-gray-300 text-sm">2. Digite o código de 6 dígitos gerado:</p>
          <input
            type="text"
            inputMode="numeric"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white tracking-widest text-center"
            placeholder="000000"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800 text-white rounded-lg"
          >
            {loading ? "Verificando..." : "Confirmar e ativar"}
          </button>
        </form>
      )}

      {step === "done" && (
        <div className="rounded-lg border border-amber-700 bg-amber-900/30 p-4 space-y-3">
          <p className="font-medium text-amber-300">
            ✓ 2FA ativado! Guarde seus códigos de recuperação.
          </p>
          <p className="text-amber-400/80 text-sm">
            Use um destes códigos se perder o acesso ao app. Cada código funciona
            UMA vez. Esta é a única vez que eles serão exibidos.
          </p>
          <div className="grid grid-cols-2 gap-2 font-mono text-sm text-gray-200">
            {recoveryCodes.map((c) => (
              <span key={c} className="bg-gray-800 rounded px-3 py-2 text-center">{c}</span>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
