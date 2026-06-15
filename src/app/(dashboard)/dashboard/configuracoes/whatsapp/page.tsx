"use client";

import { useState } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useWhatsappEnabled } from "@/hooks/useWhatsappEnabled";
import { WhatsappConnectClient } from "./whatsapp-connect-client";
import { WhatsappAutomationsClient } from "./whatsapp-automations-client";
import { WhatsappHistoryClient } from "./whatsapp-history-client";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, MessageCircleOff, QrCode, Zap, History } from "lucide-react";

function WhatsappPageGated() {
  const { enabled, loading } = useWhatsappEnabled();
  // Incrementado após "Processar agora" → força o Histórico a recarregar.
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Defesa em profundidade: a feature não está habilitada para esta empresa.
  // As rotas de API já respondem 403; aqui evitamos exibir a tela.
  if (!enabled) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <MessageCircleOff className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Integração de WhatsApp indisponível</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Este recurso ainda não está habilitado para a sua conta. Fale com o
              suporte para mais informações.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Tabs defaultValue="conexao" className="space-y-5">
        <TabsList>
          <TabsTrigger value="conexao"><QrCode className="h-4 w-4 mr-2" />Conexão</TabsTrigger>
          <TabsTrigger value="automacoes"><Zap className="h-4 w-4 mr-2" />Automações</TabsTrigger>
          <TabsTrigger value="historico"><History className="h-4 w-4 mr-2" />Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="conexao">
          <WhatsappConnectClient />
        </TabsContent>
        <TabsContent value="automacoes">
          <WhatsappAutomationsClient onProcessed={() => setHistoryRefreshKey((k) => k + 1)} />
        </TabsContent>
        <TabsContent value="historico">
          <WhatsappHistoryClient refreshKey={historyRefreshKey} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function WhatsappConfigPage() {
  return (
    <ProtectedRoute permission="settings.edit">
      <WhatsappPageGated />
    </ProtectedRoute>
  );
}
