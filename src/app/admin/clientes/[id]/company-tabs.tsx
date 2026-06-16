"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { FileText, Activity, CreditCard, StickyNote, TrendingUp, Users, Building2, MapPin, Network, Sparkles } from "lucide-react";

export type TabId = "resumo" | "dados" | "assinatura" | "filiais" | "usuarios" | "faturas" | "notas" | "uso" | "rede" | "ia";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const tabs: Tab[] = [
  { id: "resumo", label: "Resumo", icon: Activity },
  { id: "dados", label: "Dados", icon: Building2 },
  { id: "assinatura", label: "Assinatura", icon: CreditCard },
  { id: "filiais", label: "Filiais", icon: MapPin },
  { id: "usuarios", label: "Usuários", icon: Users },
  { id: "faturas", label: "Faturas", icon: FileText },
  { id: "notas", label: "Notas", icon: StickyNote },
  { id: "uso", label: "Uso", icon: TrendingUp },
  { id: "rede", label: "Rede", icon: Network },
  { id: "ia", label: "IA", icon: Sparkles },
];

const TabContext = createContext<TabId>("resumo");

interface CompanyTabsProps {
  children: ReactNode;
  defaultTab?: TabId;
}

export function CompanyTabs({ children, defaultTab = "resumo" }: CompanyTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);

  return (
    <TabContext.Provider value={activeTab}>
      <div>
        {/* Tabs Navigation */}
        <div className="border-b border-border mb-6">
          <nav className="flex gap-2">
            {tabs.map((tab) => {
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
