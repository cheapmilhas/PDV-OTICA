"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { FileText, Activity, CreditCard, StickyNote, TrendingUp, Users, Building2, MapPin, Network, Sparkles, Stethoscope } from "lucide-react";

export type TabId = "resumo" | "dados" | "assinatura" | "clinica" | "filiais" | "usuarios" | "faturas" | "notas" | "uso" | "rede" | "ia";

export type ClientProduct = "VIS_APP" | "VIS_MEDICAL";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
  /** Produtos em que a aba aparece. Ausente = todos. */
  products?: ClientProduct[];
}

// Abas product-aware: as óticas (Filiais/Uso/Rede/IA) não fazem sentido p/ a
// clínica; a aba Clínica só existe p/ medical. As comuns (Resumo/Dados/
// Assinatura/Usuários/Faturas/Notas) aparecem nos dois.
const tabs: Tab[] = [
  { id: "resumo", label: "Resumo", icon: Activity },
  { id: "dados", label: "Dados", icon: Building2 },
  { id: "assinatura", label: "Assinatura", icon: CreditCard },
  { id: "clinica", label: "Clínica", icon: Stethoscope, products: ["VIS_MEDICAL"] },
  { id: "filiais", label: "Filiais", icon: MapPin, products: ["VIS_APP"] },
  { id: "usuarios", label: "Usuários", icon: Users },
  { id: "faturas", label: "Faturas", icon: FileText },
  { id: "notas", label: "Notas", icon: StickyNote },
  { id: "uso", label: "Uso", icon: TrendingUp, products: ["VIS_APP"] },
  { id: "rede", label: "Rede", icon: Network, products: ["VIS_APP"] },
  { id: "ia", label: "IA", icon: Sparkles, products: ["VIS_APP"] },
];

/** Abas visíveis para um produto (fonte única — testável). */
export function visibleTabsFor(product: ClientProduct): TabId[] {
  return tabs.filter((tab) => !tab.products || tab.products.includes(product)).map((t) => t.id);
}

const TabContext = createContext<TabId>("resumo");

interface CompanyTabsProps {
  children: ReactNode;
  defaultTab?: TabId;
  product?: ClientProduct;
}

export function CompanyTabs({ children, defaultTab = "resumo", product = "VIS_APP" }: CompanyTabsProps) {
  const visibleTabs = tabs.filter((tab) => !tab.products || tab.products.includes(product));
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);

  return (
    <TabContext.Provider value={activeTab}>
      <div>
        {/* Tabs Navigation */}
        <div className="border-b border-border mb-6">
          <nav className="flex gap-2 overflow-x-auto">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        {children}
      </div>
    </TabContext.Provider>
  );
}

interface TabPanelProps {
  tabId: TabId;
  children: ReactNode;
}

export function TabPanel({ tabId, children }: TabPanelProps) {
  const activeTab = useContext(TabContext);
  if (activeTab !== tabId) return null;
  return <div>{children}</div>;
}
