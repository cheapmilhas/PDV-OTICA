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
import { Search, Plus, Eye, User, Mail, Phone, Shield, TrendingUp, DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function FuncionariosPage() {
  // Mock data - funcionários
  const funcionarios = [
    {
      id: "1",
      nome: "Carlos Vendedor Silva",
      email: "carlos@otica.com",
      telefone: "(11) 98765-4321",
      cargo: "Vendedor",
      nivel: "vendedor",
      dataAdmissao: "2023-01-15",
      salario: 2500.00,
      comissao: 5,
      metaMensal: 15000.00,
      vendasMes: 18450.00,
      status: "ativo",
    },
    {
      id: "2",
      nome: "Maria Atendente Costa",
      email: "maria@otica.com",
      telefone: "(11) 98765-4322",
      cargo: "Atendente",
      nivel: "vendedor",
      dataAdmissao: "2023-03-20",
      salario: 2200.00,
      comissao: 4,
      metaMensal: 12000.00,
      vendasMes: 14220.00,
      status: "ativo",
    },
    {
      id: "3",
      nome: "João Caixa Santos",
      email: "joao@otica.com",
      telefone: "(11) 98765-4323",
      cargo: "Operador de Caixa",
      nivel: "caixa",
      dataAdmissao: "2023-06-10",
      salario: 2000.00,
      comissao: 3,
      metaMensal: 10000.00,
      vendasMes: 11800.00,
      status: "ativo",
    },
    {
      id: "4",
      nome: "Ana Paula Gerente",
      email: "ana@otica.com",
      telefone: "(11) 98765-4324",
      cargo: "Gerente",
      nivel: "admin",
      dataAdmissao: "2022-08-01",
      salario: 4500.00,
      comissao: 8,
      metaMensal: 25000.00,
      vendasMes: 28900.00,
      status: "ativo",
    },
    {
      id: "5",
      nome: "Roberto Silva Admin",
      email: "roberto@otica.com",
      telefone: "(11) 98765-4325",
      cargo: "Administrador",
      nivel: "admin",
      dataAdmissao: "2022-01-10",
      salario: 5000.00,
      comissao: 0,
      metaMensal: 0,
      vendasMes: 0,
      status: "ativo",
    },
  ];

  const getNivelBadgeVariant = (nivel: string) => {
    switch (nivel) {
      case "admin":
        return "default";
      case "vendedor":
        return "secondary";
      case "caixa":
        return "outline";
      default:
        return "outline";
    }
  };

  const getNivelLabel = (nivel: string) => {
    switch (nivel) {
      case "admin":
        return "Administrador";
      case "vendedor":
        return "Vendedor";
      case "caixa":
        return "Caixa";
      default:
        return nivel;
    }
  };

  const getStatusVariant = (status: string) => {
    return status === "ativo" ? "default" : "destructive";
  };

  const getInitials = (nome: string) => {
    const parts = nome.split(" ");
    return `${parts[0][0]}${parts[1]?.[0] || parts[0][1]}`.toUpperCase();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR");
  };

  const calcularPercentualMeta = (vendas: number, meta: number) => {
    if (meta === 0) return 0;
    return ((vendas / meta) * 100).toFixed(1);
  };

  const calcularComissaoMes = (vendas: number, percentualComissao: number) => {
    return (vendas * percentualComissao) / 100;
  };

  const totalFuncionarios = funcionarios.length;
  const funcionariosAtivos = funcionarios.filter(f => f.status === "ativo").length;
  const totalVendasEquipe = funcionarios.reduce((acc, f) => acc + f.vendasMes, 0);
  const totalComissoes = funcionarios.reduce((acc, f) => acc + calcularComissaoMes(f.vendasMes, f.comissao), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Funcionários</h1>
          <p className="text-muted-foreground">
            Gerencie a equipe da ótica
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Novo Funcionário
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Funcionários
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalFuncionarios}</p>
            <p className="text-xs text-muted-foreground">
              {funcionariosAtivos} ativos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Vendas da Equipe
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(totalVendasEquipe)}
            </p>
            <p className="text-xs text-muted-foreground">
              Este mês
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Comissões do Mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">
              {formatCurrency(totalComissoes)}
            </p>
            <p className="text-xs text-muted-foreground">
              A pagar
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ticket Médio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(totalVendasEquipe / funcionariosAtivos)}
            </p>
            <p className="text-xs text-muted-foreground">
              Por funcionário
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>
            Busque funcionários cadastrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, email ou cargo..."
                className="pl-9"
              />
            </div>
            <Button variant="outline">
              Todos os Cargos
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Funcionários Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Funcionários</CardTitle>
          <CardDescription>
            {funcionarios.length} funcionários cadastrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funcionário</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Cargo/Nível</TableHead>
                <TableHead className="text-right">Salário</TableHead>
                <TableHead className="text-center">Meta vs Vendas</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {funcionarios.map((func) => {
                const percentualMeta = calcularPercentualMeta(func.vendasMes, func.metaMensal);
                const comissaoMes = calcularComissaoMes(func.vendasMes, func.comissao);
                const metaBatida = func.vendasMes >= func.metaMensal;

                return (
                  <TableRow key={func.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback className="bg-purple-100 text-purple-600">
                            {getInitials(func.nome)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{func.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            Admissão: {formatDate(func.dataAdmissao)}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="text-sm flex items-center gap-1">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          {func.email}
                        </p>
                        <p className="text-sm flex items-center gap-1">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {func.telefone}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{func.cargo}</p>
                        <Badge variant={getNivelBadgeVariant(func.nivel)} className="flex items-center gap-1 w-fit">
                          <Shield className="h-3 w-3" />
                          {getNivelLabel(func.nivel)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <p className="font-semibold">{formatCurrency(func.salario)}</p>
                      <p className="text-xs text-muted-foreground">
                        + {func.comissao}% comissão
                      </p>
                    </TableCell>
                    <TableCell className="text-center">
                      {func.metaMensal > 0 ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-sm font-medium">
                              {formatCurrency(func.vendasMes)}
                            </span>
                            {metaBatida && (
                              <TrendingUp className="h-4 w-4 text-green-600" />
                            )}
                          </div>
                          <div className="flex items-center justify-center gap-1">
                            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${metaBatida ? "bg-green-500" : "bg-blue-500"}`}
                                style={{ width: `${Math.min(100, Number(percentualMeta))}%` }}
                              />
                            </div>
                            <span className={`text-xs font-medium ${metaBatida ? "text-green-600" : ""}`}>
                              {percentualMeta}%
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Meta: {formatCurrency(func.metaMensal)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="space-y-1">
                        <p className="font-bold text-green-600">
                          {formatCurrency(comissaoMes)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Este mês
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={getStatusVariant(func.status)}>
                        {func.status === "ativo" ? "Ativo" : "Inativo"}
                      </Badge>
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
