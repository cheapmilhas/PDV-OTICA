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

  return (
    <div>
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
