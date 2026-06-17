"use client";

import { useState } from "react";
import { IaClient } from "./ia-client";
import { KnowledgeClient } from "./knowledge-client";
import { PlaygroundClient } from "./playground-client";

interface AiConfigView {
  hasKey: boolean;
  usdBrlRate: number;
  markupPercent: number;
  creditTokenFactor: number;
  qualifierModel: string;
  lensAdvisorModel: string;
  ocrModel: string;
  hasOpenaiKey: boolean;
}

interface Company {
  id: string;
  name: string;
}

type TabKey = "config" | "knowledge" | "playground";

const TABS: { key: TabKey; label: string }[] = [
  { key: "config", label: "Configuração" },
  { key: "knowledge", label: "Base de Conhecimento" },
  { key: "playground", label: "Playground" },
];

export function IaTabs({
  config,
  companies,
}: {
  config: AiConfigView;
  companies: Company[];
}) {
  const [active, setActive] = useState<TabKey>("config");
  const [massLoading, setMassLoading] = useState<boolean>(false);
  const [massError, setMassError] = useState<string>("");
  const [massFeedback, setMassFeedback] = useState<string>("");

  async function handleToggleAll(iaAvailable: boolean) {
    const label = iaAvailable ? "LIGAR" : "DESLIGAR";
    if (
      !window.confirm(
        `Tem certeza que deseja ${label} a IA para TODAS as óticas? Esta é uma ação em massa.`,
      )
    ) {
      return;
    }
    setMassError("");
    setMassFeedback("");
    setMassLoading(true);
    try {
      const res = await fetch("/api/admin/ai-toggle-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iaAvailable }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMassError((data as { error?: string }).error || "Erro ao atualizar as óticas");
        return;
      }
      const data = (await res.json()) as { data: { updated: number } };
      setMassFeedback(`${data.data.updated} ótica(s) atualizada(s).`);
    } catch {
      setMassError("Erro de rede ao atualizar as óticas");
    } finally {
      setMassLoading(false);
    }
  }

  return (
    <div>
      <div className="border-b border-border px-6 pt-4 pb-4">
        <div className="rounded-lg border border-border bg-muted p-4">
          <p className="text-sm font-semibold text-foreground">Ações globais de IA</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Liga ou desliga a disponibilidade da IA para todas as óticas de uma vez.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleToggleAll(true)}
              disabled={massLoading}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {massLoading ? "Aguarde…" : "Ligar IA para todas as óticas"}
            </button>
            <button
              type="button"
              onClick={() => handleToggleAll(false)}
              disabled={massLoading}
              className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
            >
              {massLoading ? "Aguarde…" : "Desligar IA para todas"}
            </button>
          </div>
          {massError && <p className="mt-2 text-sm text-rose-700">{massError}</p>}
          {massFeedback && <p className="mt-2 text-sm text-emerald-700">{massFeedback}</p>}
        </div>
      </div>

      <div className="border-b border-border px-6 pt-4">
        <nav className="flex gap-1" aria-label="Abas de IA">
          {TABS.map((tab) => {
            const isActive = active === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActive(tab.key)}
                aria-current={isActive ? "page" : undefined}
                className={
                  "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors " +
                  (isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground")
                }
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {active === "config" && <IaClient config={config} />}
      {active === "knowledge" && <KnowledgeClient companies={companies} />}
      {active === "playground" && <PlaygroundClient companies={companies} />}
    </div>
  );
}
