"use client";

import { useState, useEffect } from "react";
import { Plus, TrendingUp, Calendar, Award, Edit, Pause, Play, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CampaignForm } from "./campaign-form";
import { CampaignReport } from "./campaign-report";

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: "DRAFT" | "SCHEDULED" | "ACTIVE" | "PAUSED" | "ENDED" | "CANCELED";
  bonusType: string;
  scope: "SELLER" | "BRANCH" | "BOTH";
  startDate: string;
  endDate: string;
  priority: number;
  products?: Array<{
    id: string;
    productId?: string;
    categoryId?: string;
    brandId?: string;
    supplierId?: string;
    product?: { name: string };
    category?: { name: string };
    brand?: { name: string };
    supplier?: { name: string };
  }>;
  _count?: {
    bonusEntries: number;
  };
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" }> = {
  DRAFT: { label: "Rascunho", variant: "secondary" },
  SCHEDULED: { label: "Agendada", variant: "default" },
  ACTIVE: { label: "Ativa", variant: "success" },
  PAUSED: { label: "Pausada", variant: "warning" },
  ENDED: { label: "Encerrada", variant: "secondary" },
  CANCELED: { label: "Cancelada", variant: "destructive" },
};

const BONUS_TYPE_LABELS: Record<string, string> = {
  PER_UNIT: "Por Unidade",
  MINIMUM_FIXED: "Mínimo Fixo",
  MINIMUM_PER_UNIT: "Mínimo por Unidade",
  PER_PACKAGE: "Por Pacote",
  TIERED: "Faixas Progressivas",
};

const SCOPE_LABELS: Record<string, string> = {
  SELLER: "Vendedor",
  BRANCH: "Filial",
  BOTH: "Ambos",
};

export default function CampanhasPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null);
  const [reportCampaignId, setReportCampaignId] = useState<string | null>(null);
  const { toast } = useToast();

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/product-campaigns");
      const result = await response.json();

      if (result.success) {
        setCampaigns(result.data);
      } else {
        throw new Error(result.error?.message || "Erro ao carregar campanhas");
      }
    } catch (error: any) {
      toast({
        title: "Erro ao carregar campanhas",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  const handleActivate = async (id: string) => {
    try {
      const response = await fetch(`/api/product-campaigns/${id}/activate`, {
        method: "POST",
      });
      const result = await response.json();

      if (result.success) {
        toast({
          title: "Campanha ativada",
          description: "A campanha foi ativada com sucesso",
        });
        loadCampaigns();
      } else {
        throw new Error(result.error?.message || "Erro ao ativar campanha");
      }
    } catch (error: any) {
      toast({
        title: "Erro ao ativar campanha",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handlePause = async (id: string) => {
    try {
      const response = await fetch(`/api/product-campaigns/${id}/pause`, {
        method: "POST",
      });
      const result = await response.json();

      if (result.success) {
        toast({
          title: "Campanha pausada",
          description: "A campanha foi pausada com sucesso",
        });
        loadCampaigns();
      } else {
        throw new Error(result.error?.message || "Erro ao pausar campanha");
      }
    } catch (error: any) {
      toast({
        title: "Erro ao pausar campanha",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleCreateSuccess = () => {
    setCreateDialogOpen(false);
    loadCampaigns();
  };

  const handleEditSuccess = () => {
    setEditCampaign(null);
    loadCampaigns();
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Campanhas de Bonificação</h2>
          <p className="text-muted-foreground">
            Gerencie campanhas de bonificação para produtos e vendedores
          </p>
        </div>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nova Campanha
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Campanha de Bonificação</DialogTitle>
              <DialogDescription>
                Configure uma nova campanha de bonificação para seus produtos
              </DialogDescription>
            </DialogHeader>
            <CampaignForm onSuccess={handleCreateSuccess} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campanhas Ativas</CardTitle>
          <CardDescription>Lista de todas as campanhas cadastradas</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Carregando campanhas...
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma campanha cadastrada
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Escopo</TableHead>
                  <TableHead>Produtos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">{campaign.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {BONUS_TYPE_LABELS[campaign.bonusType]}
                      </Badge>
                    </TableCell>
                    <TableCell>{SCOPE_LABELS[campaign.scope]}</TableCell>
                    <TableCell>
                      {campaign.products && campaign.products.length > 0 ? (
                        <div className="flex gap-1 flex-wrap">
                          {campaign.products.slice(0, 2).map((item) => (
                            <Badge key={item.id} variant="secondary" className="text-xs">
                              {item.productId
                                ? "Produto"
                                : item.categoryId
                                ? "Categoria"
                                : item.brandId
                                ? "Marca"
                                : "Fornecedor"}
                            </Badge>
                          ))}
                          {campaign.products.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{campaign.products.length - 2}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <Badge variant="destructive" className="text-xs">
                          Sem produtos
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_LABELS[campaign.status].variant as any}>
                        {STATUS_LABELS[campaign.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(campaign.startDate).toLocaleDateString()} até{" "}
                      {new Date(campaign.endDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{campaign.priority}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {campaign.status === "DRAFT" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleActivate(campaign.id)}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        {campaign.status === "ACTIVE" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePause(campaign.id)}
                          >
                            <Pause className="h-4 w-4" />
                          </Button>
                        )}
                        {campaign.status === "PAUSED" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleActivate(campaign.id)}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setReportCampaignId(campaign.id)}
                        >
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditCampaign(campaign)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Edição */}
      <Dialog open={!!editCampaign} onOpenChange={(open) => !open && setEditCampaign(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Campanha</DialogTitle>
            <DialogDescription>
              Altere as configurações da campanha
            </DialogDescription>
          </DialogHeader>
          {editCampaign && (
            <CampaignForm campaign={editCampaign} onSuccess={handleEditSuccess} />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de Relatório */}
      <Dialog open={!!reportCampaignId} onOpenChange={(open) => !open && setReportCampaignId(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Relatório da Campanha</DialogTitle>
            <DialogDescription>
              Visualize o desempenho e resultados da campanha
            </DialogDescription>
          </DialogHeader>
          {reportCampaignId && <CampaignReport campaignId={reportCampaignId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
