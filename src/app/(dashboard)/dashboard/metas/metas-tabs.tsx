"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { usePermission } from "@/hooks/use-permission";
import { CommissionNewView } from "../relatorios/comissoes/commission-new-view";
import { CommissionLegacyView } from "../relatorios/comissoes/commission-legacy-view";
import { RankingTab } from "./ranking-tab";
import { CommissionConfigTab } from "./commission-config-tab";

type TabKey = "ranking" | "comissoes" | "config";

const TAB_PERMISSION: Record<TabKey, string> = {
  ranking: "goals.view",
  comissoes: "reports.sales",
  config: "settings.edit",
};

export function MetasTabs({
  mode,
  initialTab,
}: {
  mode: "new" | "legacy";
  initialTab: TabKey;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission, isLoading } = usePermission();

  // Loading-safe (H3): só decide as abas depois de carregar as permissões.
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const allowed = (Object.keys(TAB_PERMISSION) as TabKey[]).filter((t) =>
    hasPermission(TAB_PERMISSION[t]),
  );

  // 0 permissões → guard nega (defense-in-depth; a página já tem guard requireAny).
  if (allowed.length === 0) {
    return (
      <ProtectedRoute permission={Object.values(TAB_PERMISSION)} requireAny>
        <></>
      </ProtectedRoute>
    );
  }

  const active: TabKey = allowed.includes(initialTab) ? initialTab : allowed[0];

  const goTo = (t: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", t);
    router.replace(`/dashboard/metas?${params.toString()}`);
  };

  const showBar = allowed.length > 1;

  return (
    <Tabs value={active} onValueChange={goTo} className="space-y-6">
      {showBar && (
        <TabsList>
          {allowed.includes("ranking") && <TabsTrigger value="ranking">Ranking</TabsTrigger>}
          {allowed.includes("comissoes") && <TabsTrigger value="comissoes">Comissões</TabsTrigger>}
          {allowed.includes("config") && <TabsTrigger value="config">Configurações</TabsTrigger>}
        </TabsList>
      )}

      {allowed.includes("ranking") && (
        <TabsContent value="ranking">
          <RankingTab mode={mode} />
        </TabsContent>
      )}
      {allowed.includes("comissoes") && (
        <TabsContent value="comissoes">
          {mode === "new" ? <CommissionNewView /> : <CommissionLegacyView />}
        </TabsContent>
      )}
      {allowed.includes("config") && (
        <TabsContent value="config">
          <CommissionConfigTab />
        </TabsContent>
      )}
    </Tabs>
  );
}
