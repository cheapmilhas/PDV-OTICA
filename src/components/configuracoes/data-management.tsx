"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Database,
  Loader2,
  ShoppingCart,
  Users,
  ClipboardList,
  Eye,
  Package,
  FlaskConical,
  DollarSign,
  Award,
  FileText,
  Trash2,
  RefreshCw,
  Boxes,
  AlertOctagon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RecordCounts {
  sales: number;
  customers: number;
  serviceOrders: number;
  prescriptions: number;
  products: number;
  labs: number;
  financeEntries: number;
  accountsPayable: number;
  accountsReceivable: number;
  commissions: number;
  quotes: number;
  stockMovements: number;
  stockAdjustments: number;
}

type Category =
  | "sales"
  | "customers"
  | "serviceOrders"
  | "prescriptions"
  | "products"
  | "labs"
  | "finance"
  | "commissions"
  | "quotes"
  | "stockMovements"
  | "all";

interface CategoryConfig {
  key: Category;
  label: string;
  description: string;
  icon: React.ElementType;
  countKeys: (keyof RecordCounts)[];
  impact: string;
  color: string;
}

const CATEGORIES: CategoryConfig[] = [
  {
    key: "sales",
    label: "Vendas",
    description: "Todas as vendas, pagamentos, devoluções e dados relacionados",
    icon: ShoppingCart,
    countKeys: ["sales"],
    impact: "Itens de venda, pagamentos, movimentações de caixa, devoluções e lançamentos financeiros vinculados",
    color: "text-blue-600 bg-blue-50",
  },
  {
    key: "quotes",
    label: "Orçamentos",
    description: "Orçamentos e itens de orçamento",
    icon: FileText,
    countKeys: ["quotes"],
    impact: "Itens de orçamento, follow-ups e acompanhamentos",
    color: "text-violet-600 bg-violet-50",
  },
  {
    key: "customers",
    label: "Clientes",
    description: "Cadastro de clientes e dados relacionados",
    icon: Users,
    countKeys: ["customers"],
    impact: "Dependentes, contatos, cashback, pontos de fidelidade, lembretes, agendamentos e vínculos CRM",
    color: "text-emerald-600 bg-emerald-50",
  },
  {
    key: "serviceOrders",
    label: "Ordens de Serviço",
    description: "Ordens de serviço, histórico e qualidade",
    icon: ClipboardList,
    countKeys: ["serviceOrders"],
    impact: "Itens de OS, histórico de status, checklist de qualidade, medições de armação, garantias e reservas de estoque",
    color: "text-amber-600 bg-amber-50",
  },
  {
    key: "prescriptions",
    label: "Receitas / Prescrições",
    description: "Receitas e valores de prescrição",
    icon: Eye,
    countKeys: ["prescriptions"],
    impact: "Valores de prescrição (grau, eixo, adição). Ordens de serviço vinculadas terão o campo de receita desvinculado",
    color: "text-pink-600 bg-pink-50",
  },
  {
    key: "products",
    label: "Produtos",
    description: "Catálogo de produtos e dados de estoque",
    icon: Package,
    countKeys: ["products"],
    impact: "Detalhes de armação/lente/acessório, códigos de barra, movimentações de estoque, ajustes, reservas e lotes de inventário",
    color: "text-indigo-600 bg-indigo-50",
  },
  {
    key: "labs",
    label: "Laboratórios",
    description: "Cadastro de laboratórios e tabelas de preços",
    icon: FlaskConical,
    countKeys: ["labs"],
    impact: "Tabelas de preços, detalhes de serviço de lente. Ordens de serviço e itens vinculados terão o laboratório desvinculado",
    color: "text-cyan-600 bg-cyan-50",
  },
  {
    key: "finance",
    label: "Financeiro",
    description: "Lançamentos financeiros, contas a pagar e receber",
    icon: DollarSign,
    countKeys: ["financeEntries", "accountsPayable", "accountsReceivable"],
    impact: "Lançamentos contábeis, contas a pagar, contas a receber, conciliações, agregações diárias e relatórios DRE",
    color: "text-green-600 bg-green-50",
  },
  {
    key: "commissions",
    label: "Comissões",
    description: "Comissões de vendedores",
    icon: Award,
    countKeys: ["commissions"],
    impact: "Comissões calculadas e comissões por vendedor",
    color: "text-orange-600 bg-orange-50",
  },
  {
    key: "stockMovements",
    label: "Movimentações de Estoque",
    description: "Histórico de entradas, saídas e ajustes de estoque",
    icon: Boxes,
    countKeys: ["stockMovements", "stockAdjustments"],
    impact: "Movimentações de entrada/saída/transferência e ajustes de estoque aprovados",
    color: "text-teal-600 bg-teal-50",
  },
];

export function DataManagement() {
  const { toast } = useToast();
  const [counts, setCounts] = useState<RecordCounts | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [expandedCategory, setExpandedCategory] = useState<Category | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; category: Category | null }>({
    open: false,
    category: null,
  });
  const [confirmationText, setConfirmationText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const fetchCounts = useCallback(async () => {
    setLoadingCounts(true);
    try {
      const res = await fetch("/api/data-management/count");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setCounts(data);
    } catch {
      toast({
        title: "Erro",
        description: "Não foi possível carregar a contagem de registros.",
        variant: "destructive",
      });
    } finally {
      setLoadingCounts(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  const getCategoryCount = (cat: CategoryConfig): number => {
    if (!counts) return 0;
    return cat.countKeys.reduce((sum, key) => sum + (counts[key] || 0), 0);
  };

  const getTotalCount = (): number => {
    if (!counts) return 0;
    return Object.values(counts).reduce((sum, val) => sum + val, 0);
  };

  const handleOpenDeleteDialog = (category: Category) => {
    setDeleteDialog({ open: true, category });
    setConfirmationText("");
  };

  const handleDelete = async () => {
    if (!deleteDialog.category) return;

    const expectedText = deleteDialog.category === "all" ? "ZERAR SISTEMA" : "EXCLUIR";
    if (confirmationText !== expectedText) {
      toast({
        title: "Confirmação incorreta",
        description: `Digite "${expectedText}" para confirmar.`,
        variant: "destructive",
      });
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch("/api/data-management/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: deleteDialog.category,
          confirmation: confirmationText,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Erro ao excluir");
      }

      const data = await res.json();
      toast({
        title: "Dados excluídos",
        description: `${data.deletedCount} registro(s) removido(s) com sucesso.`,
      });

      setDeleteDialog({ open: false, category: null });
      setConfirmationText("");
      fetchCounts();
    } catch (error) {
      toast({
        title: "Erro ao excluir",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const currentCategoryConfig = deleteDialog.category
    ? CATEGORIES.find((c) => c.key === deleteDialog.category) || null
    : null;

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="border-amber-200 bg-amber-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-900">
            <AlertTriangle className="h-5 w-5" />
            Zona de Gerenciamento de Dados
          </CardTitle>
          <CardDescription className="text-amber-800">
            Gerencie e exclua dados do sistema por categoria. Todas as exclusões são permanentes e irreversíveis.
            As ações são registradas no log de auditoria.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-900">
                Total de registros: {loadingCounts ? "..." : getTotalCount().toLocaleString("pt-BR")}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchCounts}
              disabled={loadingCounts}
              className="border-amber-300 text-amber-700 hover:bg-amber-100"
            >
              <RefreshCw className={`mr-2 h-3 w-3 ${loadingCounts ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Category Cards */}
      {loadingCounts ? (
        <div className="flex justify-center py-12" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="sr-only">Carregando contagem de registros...</span>
        </div>
      ) : (
        <div className="space-y-3">
          {CATEGORIES.map((cat) => {
            const count = getCategoryCount(cat);
            const isExpanded = expandedCategory === cat.key;
            const Icon = cat.icon;

            return (
              <Card key={cat.key} className="overflow-hidden">
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : cat.key)}
                  className="flex items-center justify-between w-full px-6 py-4 text-left hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-t-lg"
                  aria-expanded={isExpanded}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cat.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{cat.label}</h3>
                      <p className="text-xs text-muted-foreground">{cat.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={count > 0 ? "default" : "secondary"} className="tabular-nums">
                      {count.toLocaleString("pt-BR")} registro{count !== 1 ? "s" : ""}
                    </Badge>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <CardContent className="border-t bg-muted/30 pt-4">
                    <div className="space-y-4">
                      {/* Count breakdown */}
                      {cat.countKeys.length > 1 && counts && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {cat.countKeys.map((key) => (
                            <div key={key} className="bg-background rounded-lg px-3 py-2 border">
                              <p className="text-xs text-muted-foreground capitalize">
                                {key.replace(/([A-Z])/g, " $1").trim()}
                              </p>
                              <p className="text-lg font-semibold tabular-nums">
                                {(counts[key] || 0).toLocaleString("pt-BR")}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Impact warning */}
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-amber-900">Dados que serão afetados:</p>
                          <p className="text-xs text-amber-700 mt-1">{cat.impact}</p>
                        </div>
                      </div>

                      {/* Delete button */}
                      <div className="flex justify-end">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={count === 0}
                          onClick={() => handleOpenDeleteDialog(cat.key)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir {cat.label}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Danger Zone - Reset System */}
      <Card className="border-red-300 bg-red-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-900">
            <AlertOctagon className="h-5 w-5" />
            Zona de Perigo
          </CardTitle>
          <CardDescription className="text-red-800">
            Zerar completamente o sistema. Remove TODOS os dados operacionais (vendas, clientes, produtos, estoque, financeiro, etc).
            Configurações de empresa, usuários e permissões são mantidos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={() => handleOpenDeleteDialog("all")}
            disabled={getTotalCount() === 0}
            className="bg-red-700 hover:bg-red-800"
          >
            <AlertOctagon className="mr-2 h-4 w-4" />
            Zerar Sistema
          </Button>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onOpenChange={(open) => {
          if (!deleting) {
            setDeleteDialog({ open, category: open ? deleteDialog.category : null });
            if (!open) setConfirmationText("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {deleteDialog.category === "all"
                ? "Zerar Sistema"
                : `Excluir ${currentCategoryConfig?.label || ""}`}
            </DialogTitle>
            <DialogDescription className="text-left">
              {deleteDialog.category === "all" ? (
                <>
                  Você está prestes a <strong>remover TODOS os dados operacionais</strong> do sistema.
                  Esta ação é <strong>permanente e irreversível</strong>.
                  <br /><br />
                  Configurações, usuários e permissões serão mantidos.
                </>
              ) : (
                <>
                  Você está prestes a excluir permanentemente{" "}
                  <strong>
                    {counts && currentCategoryConfig
                      ? getCategoryCount(currentCategoryConfig).toLocaleString("pt-BR")
                      : 0}{" "}
                    registro(s)
                  </strong>{" "}
                  de <strong>{currentCategoryConfig?.label}</strong>.
                  <br /><br />
                  <span className="text-amber-600 font-medium">
                    Dados relacionados também serão afetados: {currentCategoryConfig?.impact}
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              Para confirmar, digite{" "}
              <strong className="text-destructive font-mono">
                {deleteDialog.category === "all" ? "ZERAR SISTEMA" : "EXCLUIR"}
              </strong>{" "}
              no campo abaixo:
            </p>
            <Input
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              placeholder={deleteDialog.category === "all" ? "ZERAR SISTEMA" : "EXCLUIR"}
              className="font-mono"
              autoComplete="off"
              disabled={deleting}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialog({ open: false, category: null });
                setConfirmationText("");
              }}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={
                deleting ||
                confirmationText !== (deleteDialog.category === "all" ? "ZERAR SISTEMA" : "EXCLUIR")
              }
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Confirmar Exclusão
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
