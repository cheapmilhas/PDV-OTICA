"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useWhatsappEnabled } from "@/hooks/useWhatsappEnabled";
import { WhatsappConnectClient } from "./whatsapp-connect-client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, MessageCircleOff } from "lucide-react";

function WhatsappPageGated() {
  const { enabled, loading } = useWhatsappEnabled();

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

  return <WhatsappConnectClient />;
}

export default function WhatsappConfigPage() {
  return (
    <ProtectedRoute permission="settings.edit">
      <WhatsappPageGated />
    </ProtectedRoute>
  );
}
