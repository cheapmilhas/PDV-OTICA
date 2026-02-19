"use client";

import { useState, useEffect } from "react";
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
import { TrendingUp, Users, Package, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CampaignReportProps {
  campaignId: string;
}

interface ReportData {
  campaign: {
    id: string;
    name: string;
    status: string;
    startDate: string;
    endDate: string;
    bonusType: string;
    countMode: string;
  };
  summary: {
    totalBonus: number;
    totalEntries: number;
    byStatus: Array<{
      status: string;
      _count: number;
      _sum: { bonusAmount: number };
    }>;
  };
  topSellers: Array<{
    sellerId: string;
    sellerName: string;
    totalBonus: number;
  }>;
  topProducts: Array<{
    productId: string;
    productName: string;
    totalQuantity: number;
    totalBonus: number;
  }>;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovado",
  PAID: "Pago",
  REVERSED: "Revertido",
  EXPIRED: "Expirado",
};

export function CampaignReport({ campaignId }: CampaignReportProps) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const loadReport = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/product-campaigns/${campaignId}/report`);
        const result = await response.json();

        if (result.success) {
          setReport(result.data);
        } else {
          throw new Error(result.error?.message || "Erro ao carregar relatório");
        }
      } catch (error: any) {
        toast({
          title: "Erro ao carregar relatório",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [campaignId]);

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Carregando relatório...
      </div>
    );
  }

  if (!report) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Erro ao carregar relatório
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumo */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Bônus</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {report.summary.totalBonus.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Entradas</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{report.summary.totalEntries}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Vendedores</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{report.topSellers.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Produtos</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{report.topProducts.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Bônus por Status */}
      <Card>
        <CardHeader>
          <CardTitle>Bônus por Status</CardTitle>
          <CardDescription>Distribuição dos bônus por status de pagamento</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="text-right">Total (R$)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.summary.byStatus.map((item) => (
                <TableRow key={item.status}>
                  <TableCell>
                    <Badge variant="outline">{STATUS_LABELS[item.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{item._count}</TableCell>
                  <TableCell className="text-right">
                    R$ {(item._sum.bonusAmount || 0).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Top Vendedores */}
      <Card>
        <CardHeader>
          <CardTitle>Top 10 Vendedores</CardTitle>
          <CardDescription>Vendedores com maior bonificação</CardDescription>
        </CardHeader>
        <CardContent>
          {report.topSellers.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              Nenhum vendedor com bonificação
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Total de Bônus (R$)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.topSellers.map((seller, index) => (
                  <TableRow key={seller.sellerId}>
                    <TableCell className="font-medium">
                      {index + 1}. {seller.sellerName}
                    </TableCell>
                    <TableCell className="text-right">
                      R$ {seller.totalBonus.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Top Produtos */}
      <Card>
        <CardHeader>
          <CardTitle>Top 10 Produtos</CardTitle>
          <CardDescription>Produtos mais vendidos na campanha</CardDescription>
        </CardHeader>
        <CardContent>
          {report.topProducts.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              Nenhum produto vendido
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Total de Bônus (R$)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.topProducts.map((product, index) => (
                  <TableRow key={product.productId}>
                    <TableCell className="font-medium">
                      {index + 1}. {product.productName}
                    </TableCell>
                    <TableCell className="text-right">{product.totalQuantity}</TableCell>
                    <TableCell className="text-right">
                      R$ {product.totalBonus.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
