"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function RelatorioContasPagarPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/relatorios">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Contas a Pagar</h1>
          <p className="text-muted-foreground">
            Gestão de contas a pagar e fornecedores
          </p>
        </div>
      </div>

      {/* Content */}
      <Card>
        <CardHeader>
          <CardTitle>Relatório em Desenvolvimento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <p className="text-lg text-muted-foreground mb-4">
              O serviço backend de Contas a Pagar está implementado e funcionando.
            </p>
            <p className="text-muted-foreground mb-6">
              A interface do usuário para este relatório está em desenvolvimento.
            </p>
            <div className="bg-muted p-6 rounded-lg text-left max-w-2xl mx-auto">
              <h3 className="font-semibold mb-2">Funcionalidades Disponíveis no Backend:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Análise de contas a pagar pendentes</li>
                <li>Filtro por fornecedor</li>
                <li>Análise de vencimentos (vencidas vs a vencer)</li>
                <li>Aging de contas (0-30, 31-60, 61-90, +90 dias)</li>
                <li>Breakdown por fornecedor</li>
                <li>Projeção mensal de pagamentos (próximos 6 meses)</li>
                <li>KPIs: Total a pagar, valores vencidos, ticket médio</li>
              </ul>
              <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-200">
                <p className="text-sm text-blue-900">
                  <strong>Serviço:</strong> <code className="bg-blue-100 px-2 py-1 rounded">AccountsPayableService</code>
                </p>
                <p className="text-sm text-blue-900 mt-1">
                  <strong>Arquivo:</strong> <code className="bg-blue-100 px-2 py-1 rounded">src/services/reports/accounts-payable.service.ts</code>
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
