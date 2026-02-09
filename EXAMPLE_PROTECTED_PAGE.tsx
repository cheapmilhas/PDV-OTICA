/**
 * EXEMPLO: Como aplicar proteções na página de Vendas
 *
 * Este arquivo demonstra como usar os componentes de proteção.
 * Copie e adapte estes exemplos para suas páginas.
 */

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Eye } from "lucide-react";
import { useRouter } from "next/navigation";

// ========================================
// IMPORTS NECESSÁRIOS PARA PROTEÇÃO
// ========================================
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ProtectedAction } from "@/components/auth/ProtectedAction";

export default function VendasPage() {
  // ========================================
  // PROTEGER A PÁGINA INTEIRA
  // ========================================
  return (
    <ProtectedRoute permission="sales.view">
      <VendasContent />
    </ProtectedRoute>
  );
}

function VendasContent() {
  const router = useRouter();
  const [vendas, setVendas] = useState<any[]>([]);

  return (
    <div className="space-y-6">
      {/* Header com botão Nova Venda */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Vendas</h1>
          <p className="text-muted-foreground">Histórico de vendas realizadas</p>
        </div>

        {/* ========================================
            PROTEGER BOTÃO "NOVA VENDA"
            Só aparece se tiver permissão sales.create
            ======================================== */}
        <ProtectedAction permission="sales.create">
          <Button onClick={() => router.push("/dashboard/pdv")}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Venda
          </Button>
        </ProtectedAction>
      </div>

      {/* Lista de vendas */}
      <div className="space-y-4">
        {vendas.map((venda) => (
          <Card key={venda.id}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Venda #{venda.numero}</p>
                  <p className="text-sm text-muted-foreground">
                    Cliente: {venda.cliente}
                  </p>
                  <p className="text-sm">Total: R$ {venda.total}</p>
                </div>

                <div className="flex gap-2">
                  {/* ========================================
                      BOTÃO DETALHES - Sempre visível
                      Requer apenas sales.view (já verificado na página)
                      ======================================== */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push(`/dashboard/vendas/${venda.id}/detalhes`)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Detalhes
                  </Button>

                  {/* ========================================
                      BOTÃO EDITAR - Só aparece com permissão
                      ======================================== */}
                  <ProtectedAction permission="sales.edit">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push(`/dashboard/vendas/${venda.id}/editar`)}
                    >
                      Editar
                    </Button>
                  </ProtectedAction>

                  {/* ========================================
                      BOTÃO CANCELAR - Desabilitado sem permissão
                      Aparece mas fica disable
                      ======================================== */}
                  <ProtectedAction permission="sales.cancel" fallbackMode="disable">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleCancel(venda.id)}
                    >
                      Cancelar
                    </Button>
                  </ProtectedAction>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ========================================
          SEÇÃO DE RELATÓRIOS
          Só aparece se tiver permissão de relatórios
          ======================================== */}
      <ProtectedAction
        permission="reports.sales"
        fallbackMode="message"
        fallbackMessage="Você precisa de permissão de Relatórios de Vendas para visualizar esta seção"
      >
        <Card>
          <CardHeader>
            <CardTitle>Análise de Vendas</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Gráficos e análises aqui...</p>
          </CardContent>
        </Card>
      </ProtectedAction>

      {/* ========================================
          MÚLTIPLAS PERMISSÕES - Precisa ter TODAS
          ======================================== */}
      <ProtectedAction permission={["sales.export", "reports.sales"]}>
        <Button onClick={() => exportSales()}>
          Exportar Relatório
        </Button>
      </ProtectedAction>

      {/* ========================================
          MÚLTIPLAS PERMISSÕES - Precisa ter ALGUMA
          ======================================== */}
      <ProtectedAction
        permission={["sales.manage", "sales.edit"]}
        requireAny
      >
        <Button onClick={() => openManagePanel()}>
          Gerenciar Vendas
        </Button>
      </ProtectedAction>
    </div>
  );
}

// Funções auxiliares
function handleCancel(id: string) {
  console.log("Cancelar venda", id);
}

function exportSales() {
  console.log("Exportar vendas");
}

function openManagePanel() {
  console.log("Abrir painel de gerenciamento");
}

// ========================================
// EXEMPLO 2: Usando o Hook diretamente
// ========================================
import { usePermissions } from "@/hooks/usePermissions";

function VendasWithHook() {
  const { hasPermission, hasAnyPermission, isLoading } = usePermissions();

  // Aguardar carregamento
  if (isLoading) {
    return <div>Carregando...</div>;
  }

  // Lógica condicional complexa
  const showAdvancedFilters = hasPermission('sales.advanced_filters');
  const canExport = hasAnyPermission(['sales.export', 'reports.sales']);

  return (
    <div>
      {showAdvancedFilters && (
        <div>Filtros avançados...</div>
      )}

      {canExport && (
        <Button>Exportar</Button>
      )}

      {/* Mensagem customizada */}
      {!hasPermission('sales.create') && (
        <p className="text-sm text-muted-foreground">
          Você não pode criar vendas. Entre em contato com o administrador.
        </p>
      )}
    </div>
  );
}

// ========================================
// EXEMPLO 3: Página de Produtos
// ========================================
export function ProdutosPageExample() {
  return (
    <ProtectedRoute permission="products.view">
      <div className="space-y-6">
        <div className="flex justify-between">
          <h1>Produtos</h1>

          <div className="flex gap-2">
            {/* Botão Novo Produto */}
            <ProtectedAction permission="products.create">
              <Button>Novo Produto</Button>
            </ProtectedAction>

            {/* Botão Importar */}
            <ProtectedAction permission="products.import">
              <Button variant="outline">Importar</Button>
            </ProtectedAction>

            {/* Botão Exportar */}
            <ProtectedAction permission="products.export">
              <Button variant="outline">Exportar</Button>
            </ProtectedAction>
          </div>
        </div>

        {/* Tabela de produtos */}
        <ProductsTable />
      </div>
    </ProtectedRoute>
  );
}

function ProductsTable() {
  return (
    <div>
      {/* Tabela com ações protegidas em cada linha */}
    </div>
  );
}

// ========================================
// EXEMPLO 4: Página PDV (Criar Venda)
// ========================================
export function PDVPageExample() {
  return (
    <ProtectedRoute
      permission="sales.create"
      message="Você não tem permissão para acessar o PDV e criar vendas"
    >
      <div>
        <h1>PDV - Ponto de Venda</h1>
        {/* Conteúdo do PDV */}
      </div>
    </ProtectedRoute>
  );
}

// ========================================
// EXEMPLO 5: Página de Configurações
// ========================================
export function ConfiguracoesPageExample() {
  return (
    <ProtectedRoute
      permission="settings.view"
      message="Apenas administradores e gerentes podem acessar as configurações"
    >
      <div className="space-y-6">
        <h1>Configurações</h1>

        {/* Permissões do Sistema - Apenas ADMIN */}
        <ProtectedAction
          permission="settings.permissions"
          fallbackMode="message"
          fallbackMessage="Apenas administradores podem gerenciar permissões do sistema"
        >
          <Card>
            <CardHeader>
              <CardTitle>Permissões do Sistema</CardTitle>
            </CardHeader>
            <CardContent>
              <Button>Gerenciar Permissões</Button>
            </CardContent>
          </Card>
        </ProtectedAction>

        {/* Regras de Negócio */}
        <ProtectedAction permission="settings.rules">
          <Card>
            <CardHeader>
              <CardTitle>Regras de Negócio</CardTitle>
            </CardHeader>
            <CardContent>
              <Button>Editar Regras</Button>
            </CardContent>
          </Card>
        </ProtectedAction>
      </div>
    </ProtectedRoute>
  );
}
