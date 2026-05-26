"use client";

import { useState } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

/**
 * Página de configuração fiscal por filial.
 *
 * NÃO ATIVA: enquanto a emissão fiscal não estiver habilitada (FOCUS_NFE_TOKEN
 * ausente), a página mostra apenas placeholder informando o status.
 *
 * Quando ligada: formulário para CNPJ, IE, regime tributário, CFOP padrão,
 * CSOSN, ambiente (homologação/produção), upload de certificado A1, CSC.
 */
function ConfigFiscalContent() {
  const [fiscalEnabled] = useState(false); // Hardcoded por enquanto

  if (!fiscalEnabled) {
    return (
      <div className="container mx-auto py-8 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Configuração Fiscal (NFC-e)</CardTitle>
            <CardDescription>
              Emissão de Nota Fiscal de Consumidor Eletrônica
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <div className="space-y-2">
                <p className="font-semibold">Emissão fiscal não habilitada</p>
                <p>
                  Esta versão do PDV Ótica <strong>não emite NFC-e/NF-e</strong>. A emissão
                  de documentos fiscais é responsabilidade do estabelecimento, conforme
                  cláusula 2 dos Termos de Uso.
                </p>
                <p>
                  Use um sistema emissor próprio (ou de terceiros) em paralelo. A integração
                  com Focus NFe será disponibilizada em versão futura.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Configuração Fiscal (NFC-e)</CardTitle>
          <CardDescription>
            Preencha os dados fiscais da filial para emitir NFC-e
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Formulário em desenvolvimento (CNPJ, IE, Regime, CFOP, CSOSN, certificado A1, CSC).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission={["company.update"]}>
      <ConfigFiscalContent />
    </ProtectedRoute>
  );
}
