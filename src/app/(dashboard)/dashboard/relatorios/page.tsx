"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart3,
  DollarSign,
  Package,
  TrendingUp,
  FileText,
  Users,
  ShoppingCart,
} from "lucide-react";

const reports = [
  {
    title: "Vendas Consolidado",
    description: "Análise completa de vendas com KPIs, gráficos e detalhamento",
    icon: ShoppingCart,
    href: "/dashboard/relatorios/vendas",
    color: "text-blue-600",
    bgColor: "bg-blue-100",
  },
  {
    title: "Produtos Vendidos",
    description: "Top sellers, classificação ABC e análise por categoria",
    icon: Package,
    href: "/dashboard/relatorios/produtos-vendidos",
    color: "text-green-600",
    bgColor: "bg-green-100",
  },
  {
    title: "Comissões",
    description: "Relatório de comissões por vendedor com status detalhado",
    icon: DollarSign,
    href: "/dashboard/relatorios/comissoes",
    color: "text-purple-600",
    bgColor: "bg-purple-100",
  },
  {
    title: "Posição de Estoque",
    description: "Análise completa de estoque com alertas de mínimo",
    icon: Package,
    href: "/dashboard/relatorios/posicao-estoque",
    color: "text-orange-600",
    bgColor: "bg-orange-100",
  },
  {
    title: "Produtos sem Giro",
    description: "Identificação de produtos parados no estoque",
    icon: TrendingUp,
    href: "/dashboard/relatorios/produtos-sem-giro",
    color: "text-red-600",
    bgColor: "bg-red-100",
  },
];

const upcomingReports = [
  {
    title: "Contas a Receber",
    description: "Análise de recebíveis e inadimplência",
    icon: FileText,
    badge: "Sprint C",
  },
  {
    title: "Contas a Pagar",
    description: "Gestão de contas a pagar e fornecedores",
    icon: FileText,
    badge: "Sprint C",
  },
  {
    title: "DRE Gerencial",
    description: "Demonstrativo de Resultado do Exercício",
    icon: BarChart3,
    badge: "Sprint D",
  },
];

export default function RelatoriosPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground">
            Central de análises e relatórios gerenciais
          </p>
        </div>
      </div>

      {/* Relatórios Disponíveis */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Relatórios Disponíveis (Sprint A + B)</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {reports.map((report) => {
            const Icon = report.icon;
            return (
              <Link key={report.href} href={report.href}>
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className={`p-3 rounded-lg ${report.bgColor}`}>
                        <Icon className={`h-6 w-6 ${report.color}`} />
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-lg">{report.title}</CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{report.description}</CardDescription>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Próximos Relatórios */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Em Breve</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {upcomingReports.map((report, index) => {
            const Icon = report.icon;
            return (
              <Card key={index} className="opacity-60">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-lg bg-gray-100">
                      <Icon className="h-6 w-6 text-gray-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{report.title}</CardTitle>
                        <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">
                          {report.badge}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>{report.description}</CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
