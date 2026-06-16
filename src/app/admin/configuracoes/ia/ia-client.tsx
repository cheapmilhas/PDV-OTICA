"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";

interface AiConfigView {
  hasKey: boolean;
  usdBrlRate: number;
  markupPercent: number;
  creditTokenFactor: number;
}

export function IaClient({ config }: { config: AiConfigView }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Controlled fields
  const [apiKey, setApiKey] = useState("");
  const [usdBrlRate, setUsdBrlRate] = useState(String(config.usdBrlRate));
  const [markupPercent, setMarkupPercent] = useState(String(config.markupPercent));
  const [creditTokenFactor, setCreditTokenFactor] = useState(String(config.creditTokenFactor));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);

    const body: {
      anthropicKey?: string;
      usdBrlRate?: number;
      markupPercent?: number;
      creditTokenFactor?: number;
    } = {};

    // Only send the key if the user typed something
    if (apiKey.trim().length > 0) {
      body.anthropicKey = apiKey.trim();
    }

    const parsedRate = parseFloat(usdBrlRate);
    const parsedMarkup = parseFloat(markupPercent);
    const parsedFactor = parseInt(creditTokenFactor, 10);

    if (!isNaN(parsedRate)) body.usdBrlRate = parsedRate;
    if (!isNaN(parsedMarkup)) body.markupPercent = parsedMarkup;
    if (!isNaN(parsedFactor)) body.creditTokenFactor = parsedFactor;

    try {
      const res = await fetch("/api/admin/ai-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error || "Erro ao salvar configuração");
        return;
      }

      setSuccess(true);
      setApiKey(""); // Clear the key input after save
      router.refresh();
    } catch {
      setError("Erro de rede ao salvar configuração");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <PageHeader
        title="Inteligência Artificial"
        subtitle="Configure a chave da API Anthropic e os parâmetros de custo para precificação de créditos de IA."
      />

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
          <p className="text-sm text-rose-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <p className="text-sm text-emerald-700 font-medium">Configuração salva com sucesso.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* API Key section */}
        <div className="bg-muted border border-border rounded-lg p-5 space-y-4">
          <div>
            <p className="font-semibold text-foreground">Chave da API Anthropic</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Status:{" "}
              {config.hasKey ? (
                <span className="font-medium text-emerald-700">🔑 Chave configurada</span>
              ) : (
                <span className="font-medium text-amber-700">⚠️ Nenhuma chave cadastrada</span>
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="api-key" className="text-sm font-medium text-foreground">
              Nova chave
            </label>
            <input
              id="api-key"
              type="password"
              autoComplete="new-password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                config.hasKey
                  ? "•••••••• (configurada — deixe em branco para manter)"
                  : "sk-ant-..."
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            {config.hasKey && (
              <p className="text-xs text-muted-foreground">
                A chave fica cifrada e não é exibida. Deixe em branco para manter a atual.
              </p>
            )}
          </div>
        </div>

        {/* Pricing parameters section */}
        <div className="bg-muted border border-border rounded-lg p-5 space-y-4">
          <div>
            <p className="font-semibold text-foreground">Parâmetros de custo</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Usados para calcular o preço de venda dos créditos de IA às óticas.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="usd-brl-rate" className="text-sm font-medium text-foreground">
                Câmbio USD → BRL
              </label>
              <input
                id="usd-brl-rate"
                type="number"
                step="0.01"
                min="0"
                value={usdBrlRate}
                onChange={(e) => setUsdBrlRate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <p className="text-xs text-muted-foreground">Ex: 5.50 = R$ 5,50 por US$ 1</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="markup-percent" className="text-sm font-medium text-foreground">
                Markup (%)
              </label>
              <input
                id="markup-percent"
                type="number"
                step="1"
                min="0"
                value={markupPercent}
                onChange={(e) => setMarkupPercent(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <p className="text-xs text-muted-foreground">Ex: 40 = 40% sobre o custo bruto</p>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="credit-token-factor" className="text-sm font-medium text-foreground">
                Fator de crédito (tokens/crédito)
              </label>
              <input
                id="credit-token-factor"
                type="number"
                step="1"
                min="1"
                value={creditTokenFactor}
                onChange={(e) => setCreditTokenFactor(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <p className="text-xs text-muted-foreground">
                Quantos tokens equivalem a 1 crédito vendido. Ex: 1000 = 1 crédito por mil tokens.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-md bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Salvando…" : "Salvar configuração"}
          </button>
        </div>
      </form>
    </div>
  );
}
