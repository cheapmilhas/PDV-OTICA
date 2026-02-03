"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, Plus, Eye, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function OrdensServicoPage() {
  const [filtroStatus, setFiltroStatus] = useState("todas");

  // Mock data - ordens de serviço
  const ordensServico = [
    {
      id: "OS-001",
      cliente: "Maria Silva Santos",
      tipo: "Montagem de Óculos",
      descricao: "Montagem lente + armação Ray-Ban",
      status: "em_andamento",
      prioridade: "alta",
      dataAbertura: "2024-01-30",
      prazoEntrega: "2024-02-02",
      valor: 1280.90,
      vendedor: "Carlos Vendedor",
    },
    {
      id: "OS-002",
      cliente: "João Pedro Oliveira",
      tipo: "Ajuste de Armação",
      descricao: "Ajuste de hastes e ponte nasal",
      status: "concluida",
      prioridade: "baixa",
      dataAbertura: "2024-01-28",
      prazoEntrega: "2024-01-29",
      dataConclusao: "2024-01-29",
      valor: 0.00,
      vendedor: "Maria Atendente",
    },
    {
      id: "OS-003",
      cliente: "Ana Paula Costa",
      tipo: "Troca de Lentes",
      descricao: "Troca lentes multifocais Zeiss",
      status: "aguardando_material",
      prioridade: "media",
      dataAbertura: "2024-01-25",
      prazoEntrega: "2024-02-05",
      valor: 1580.00,
      vendedor: "Carlos Vendedor",
    },
    {
      id: "OS-004",
      cliente: "Carlos Eduardo Lima",
      tipo: "Reparo",
      descricao: "Soldagem de armação quebrada",
      status: "em_andamento",
      prioridade: "alta",
      dataAbertura: "2024-01-31",
      prazoEntrega: "2024-02-01",
      valor: 120.00,
      vendedor: "João Caixa",
    },
    {
      id: "OS-005",
      cliente: "Juliana Ferreira Souza",
      tipo: "Montagem de Óculos",
      descricao: "Montagem lente Transitions + armação",
      status: "pendente",
      prioridade: "media",
      dataAbertura: "2024-01-31",
      prazoEntrega: "2024-02-07",
      valor: 920.00,
      vendedor: "Maria Atendente",
    },
    {
      id: "OS-006",
      cliente: "Roberto Carlos Almeida",
      tipo: "Ajuste de Armação",
      descricao: "Ajuste de hastes e troca de parafusos",
      status: "cancelada",
      prioridade: "baixa",
      dataAbertura: "2024-01-20",
      prazoEntrega: "2024-01-22",
      dataCancelamento: "2024-01-21",
      valor: 0.00,
      vendedor: "Carlos Vendedor",
    },
  ];

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "concluida":
        return "default";
      case "em_andamento":
        return "secondary";
      case "aguardando_material":
        return "outline";
      case "pendente":
        return "outline";
      case "cancelada":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "concluida":
        return "Concluída";
      case "em_andamento":
        return "Em Andamento";
      case "aguardando_material":
        return "Aguardando Material";
      case "pendente":
        return "Pendente";
      case "cancelada":
        return "Cancelada";
      default:
        return status;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "concluida":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "em_andamento":
        return <Clock className="h-4 w-4 text-blue-600" />;
      case "aguardando_material":
        return <AlertCircle className="h-4 w-4 text-orange-600" />;
      case "pendente":
        return <Clock className="h-4 w-4 text-gray-600" />;
      case "cancelada":
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  const getPrioridadeVariant = (prioridade: string) => {
    switch (prioridade) {
      case "alta":
        return "destructive";
      case "media":
        return "secondary";
      case "baixa":
        return "outline";
      default:
        return "secondary";
    }
  };

  const getPrioridadeLabel = (prioridade: string) => {
    switch (prioridade) {
      case "alta":
        return "Alta";
      case "media":
        return "Média";
      case "baixa":
        return "Baixa";
      default:
        return prioridade;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR");
  };

  const calcularDiasRestantes = (prazoEntrega: string) => {
    const hoje = new Date();
    const prazo = new Date(prazoEntrega);
    const diff = Math.ceil((prazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const ordensFiltradas = filtroStatus === "todas"
    ? ordensServico
    : ordensServico.filter((os) => os.status === filtroStatus);

  const totalOS = ordensServico.length;
  const emAndamento = ordensServico.filter((os) => os.status === "em_andamento").length;
  const aguardandoMaterial = ordensServico.filter((os) => os.status === "aguardando_material").length;
  const concluidas = ordensServico.filter((os) => os.status === "concluida").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Ordens de Serviço</h1>
          <p className="text-muted-foreground">
            Gerencie as ordens de serviço da ótica
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Nova Ordem de Serviço
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de OS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalOS}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Em Andamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{emAndamento}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Aguardando Material
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-600">{aguardandoMaterial}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Concluídas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{concluidas}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>
            Busque e filtre ordens de serviço
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por número, cliente ou tipo..."
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={filtroStatus === "todas" ? "default" : "outline"}
                onClick={() => setFiltroStatus("todas")}
              >
                Todas
              </Button>
              <Button
                variant={filtroStatus === "em_andamento" ? "default" : "outline"}
                onClick={() => setFiltroStatus("em_andamento")}
              >
                Em Andamento
              </Button>
              <Button
                variant={filtroStatus === "aguardando_material" ? "default" : "outline"}
                onClick={() => setFiltroStatus("aguardando_material")}
              >
                Aguardando
              </Button>
              <Button
                variant={filtroStatus === "concluida" ? "default" : "outline"}
                onClick={() => setFiltroStatus("concluida")}
              >
                Concluídas
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* OS Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Ordens de Serviço</CardTitle>
          <CardDescription>
            {ordensFiltradas.length} ordens de serviço
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo de Serviço</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Prioridade</TableHead>
                <TableHead className="text-center">Prazo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordensFiltradas.map((os) => {
                const diasRestantes = calcularDiasRestantes(os.prazoEntrega);
                const prazoVencido = diasRestantes < 0 && os.status !== "concluida" && os.status !== "cancelada";

                return (
                  <TableRow key={os.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(os.status)}
                        <span className="font-mono font-medium">{os.id}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{os.cliente}</p>
                        <p className="text-xs text-muted-foreground">
                          Vendedor: {os.vendedor}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{os.tipo}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {os.descricao}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={getStatusVariant(os.status)}>
                        {getStatusLabel(os.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={getPrioridadeVariant(os.prioridade)}>
                        {getPrioridadeLabel(os.prioridade)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div>
                        <p className="text-sm font-medium">
                          {formatDate(os.prazoEntrega)}
                        </p>
                        {os.status !== "concluida" && os.status !== "cancelada" && (
                          <p className={`text-xs ${prazoVencido ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                            {prazoVencido
                              ? `Atrasado ${Math.abs(diasRestantes)} dias`
                              : diasRestantes === 0
                              ? "Vence hoje"
                              : `${diasRestantes} dias restantes`
                            }
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {os.valor > 0 ? formatCurrency(os.valor) : "Cortesia"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
