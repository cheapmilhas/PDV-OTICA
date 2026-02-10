"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Target, TrendingUp, Trophy, Award, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface MetaGeral {
  mes: string;
  valorMeta: number;
  valorAtual: number;
  percentual: number;
}

interface Resumo {
  totalComissoes: number;
  vendedoresNaMeta: number;
  totalVendedores: number;
}

interface Vendedor {
  id: string;
  nome: string;
  meta: number;
  vendas: number;
  percentual: number;
  comissao: number;
  posicao: number;
}

function MetasPage() {
  const [loading, setLoading] = useState(true);
  const [metaGeral, setMetaGeral] = useState<MetaGeral>({
    mes: "",
    valorMeta: 0,
    valorAtual: 0,
    percentual: 0,
  });
  const [resumo, setResumo] = useState<Resumo>({
    totalComissoes: 0,
    vendedoresNaMeta: 0,
    totalVendedores: 0,
  });
  const [metasVendedores, setMetasVendedores] = useState<Vendedor[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [summaryRes, rankingRes] = await Promise.all([
          fetch('/api/goals/monthly-summary'),
          fetch('/api/goals/sellers-ranking'),
        ]);

        if (summaryRes.ok) {
          const summaryData = await summaryRes.json();
          setMetaGeral(summaryData.metaGeral);
          setResumo(summaryData.resumo);
        }

        if (rankingRes.ok) {
          const rankingData = await rankingRes.json();
          setMetasVendedores(rankingData.data);
        }
      } catch (error) {
        console.error("Erro ao carregar dados de metas:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const getInitials = (nome: string) => {
    const parts = nome.split(" ");
    return `${parts[0][0]}${parts[1]?.[0] || parts[0][1]}`.toUpperCase();
  };

  const getPosicaoIcon = (posicao: number) => {
    switch (posicao) {
      case 1:
        return <Trophy className="h-6 w-6 text-yellow-500" />;
      case 2:
        return <Award className="h-6 w-6 text-gray-400" />;
      case 3:
        return <Award className="h-6 w-6 text-orange-600" />;
      default:
        return <Target className="h-6 w-6 text-blue-500" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Metas e Comissões</h1>
        <p className="text-muted-foreground">
          Acompanhe as metas e performance da equipe
        </p>
      </div>

      {/* Meta Geral */}
      <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-purple-50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Target className="h-6 w-6" />
                Meta do Mês - {metaGeral.mes}
              </CardTitle>
              <CardDescription className="mt-2">
                Performance geral da equipe de vendas
              </CardDescription>
            </div>
            <Badge variant={metaGeral.percentual >= 100 ? "default" : "secondary"} className="text-2xl px-4 py-2">
              {metaGeral.percentual.toFixed(1)}%
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={metaGeral.percentual} className="h-4" />
          <div className="flex justify-between text-lg">
            <div>
              <p className="text-muted-foreground">Realizado</p>
              <p className="font-bold text-2xl">{formatCurrency(metaGeral.valorAtual)}</p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground">Meta</p>
              <p className="font-bold text-2xl">{formatCurrency(metaGeral.valorMeta)}</p>
            </div>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sm text-muted-foreground">Faltam</p>
                <p className="text-xl font-bold text-orange-600">
                  {formatCurrency(metaGeral.valorMeta - metaGeral.valorAtual)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Vendedores na Meta</p>
                <p className="text-xl font-bold text-green-600">
                  {resumo.vendedoresNaMeta}/{resumo.totalVendedores}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Comissões</p>
                <p className="text-xl font-bold text-blue-600">
                  {formatCurrency(resumo.totalComissoes)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ranking de Vendedores */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Ranking de Vendedores
          </CardTitle>
          <CardDescription>
            Performance individual da equipe de vendas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {metasVendedores.map((vendedor) => (
              <div key={vendedor.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-12 h-12">
                      {getPosicaoIcon(vendedor.posicao)}
                    </div>
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-purple-100 text-purple-600 text-lg">
                        {getInitials(vendedor.nome)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-lg">{vendedor.nome}</p>
                      <p className="text-sm text-muted-foreground">
                        {vendedor.posicao}º Lugar no Ranking
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={vendedor.percentual >= 100 ? "default" : "secondary"}
                    className="text-lg px-3 py-1"
                  >
                    {vendedor.percentual.toFixed(1)}%
                  </Badge>
                </div>

                <div className="space-y-3">
                  <Progress value={Math.min(100, vendedor.percentual)} className="h-3" />

                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground mb-1">Meta</p>
                      <p className="font-semibold">{formatCurrency(vendedor.meta)}</p>
                    </div>
                    <div className="rounded-lg bg-green-50 p-3">
                      <p className="text-xs text-muted-foreground mb-1">Vendas</p>
                      <p className="font-semibold text-green-600">
                        {formatCurrency(vendedor.vendas)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-blue-50 p-3">
                      <p className="text-xs text-muted-foreground mb-1">Comissão</p>
                      <p className="font-semibold text-blue-600">
                        {formatCurrency(vendedor.comissao)}
                      </p>
                    </div>
                    <div className={`rounded-lg p-3 ${
                      vendedor.percentual >= 100 ? "bg-green-100" : "bg-orange-50"
                    }`}>
                      <p className="text-xs text-muted-foreground mb-1">
                        {vendedor.percentual >= 100 ? "Superou" : "Faltam"}
                      </p>
                      <p className={`font-semibold ${
                        vendedor.percentual >= 100 ? "text-green-600" : "text-orange-600"
                      }`}>
                        {formatCurrency(Math.abs(vendedor.vendas - vendedor.meta))}
                      </p>
                    </div>
                  </div>

                  {vendedor.percentual >= 100 && (
                    <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-lg p-2">
                      <TrendingUp className="h-4 w-4" />
                      <span className="font-medium">
                        Meta atingida! Superou em {(vendedor.percentual - 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="goals.access">
      <MetasPage />
    </ProtectedRoute>
  );
}
