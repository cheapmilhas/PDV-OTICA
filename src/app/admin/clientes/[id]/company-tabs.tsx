"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { FileText, Activity, CreditCard, StickyNote, TrendingUp } from "lucide-react";

export type TabId = "resumo" | "assinatura" | "faturas" | "notas" | "uso";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const tabs: Tab[] = [
  { id: "resumo", label: "Resumo", icon: Activity },
  { id: "assinatura", label: "Assinatura", icon: CreditCard },
  { id: "faturas", label: "Faturas", icon: FileText },
  { id: "notas", label: "Notas", icon: StickyNote },
  { id: "uso", label: "Uso", icon: TrendingUp },
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
        <div className="border-b border-gray-800 mb-6">
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
                      ? "border-indigo-500 text-white"
                      : "border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-700"
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
