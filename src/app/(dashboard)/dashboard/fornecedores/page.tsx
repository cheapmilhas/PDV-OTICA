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
import { Search, Plus, Eye, Building2, Phone, Mail, MapPin, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function FornecedoresPage() {
  // Mock data - fornecedores
  const fornecedores = [
    {
      id: "1",
      nome: "Ray-Ban do Brasil Ltda",
      cnpj: "12.345.678/0001-90",
      email: "comercial@rayban.com.br",
      telefone: "(11) 3456-7890",
      endereco: "Av. Paulista, 1000",
      cidade: "São Paulo",
      estado: "SP",
      categoria: "Armações",
      totalCompras: 45600.00,
      ultimaCompra: "2024-01-28",
      status: "ativo",
    },
    {
      id: "2",
      nome: "Essilor do Brasil",
      cnpj: "23.456.789/0001-01",
      email: "vendas@essilor.com.br",
      telefone: "(11) 3567-8901",
      endereco: "Rua das Indústrias, 500",
      cidade: "São Paulo",
      estado: "SP",
      categoria: "Lentes",
      totalCompras: 32400.00,
      ultimaCompra: "2024-01-30",
      status: "ativo",
    },
    {
      id: "3",
      nome: "Oakley Brasil Importadora",
      cnpj: "34.567.890/0001-12",
      email: "contato@oakley.com.br",
      telefone: "(11) 3678-9012",
      endereco: "Av. das Nações, 2000",
      cidade: "São Paulo",
      estado: "SP",
      categoria: "Armações",
      totalCompras: 28900.00,
      ultimaCompra: "2024-01-25",
      status: "ativo",
    },
    {
      id: "4",
      nome: "Zeiss Optical do Brasil",
      cnpj: "45.678.901/0001-23",
      email: "vendas@zeiss.com.br",
      telefone: "(11) 3789-0123",
      endereco: "Rua Alemanha, 750",
      cidade: "São Paulo",
      estado: "SP",
      categoria: "Lentes",
      totalCompras: 42800.00,
      ultimaCompra: "2024-01-29",
      status: "ativo",
    },
    {
      id: "5",
      nome: "Acessórios Plus Comércio",
      cnpj: "56.789.012/0001-34",
      email: "vendas@acessoriosplus.com.br",
      telefone: "(11) 3890-1234",
      endereco: "Rua do Comércio, 123",
      cidade: "São Paulo",
      estado: "SP",
      categoria: "Acessórios",
      totalCompras: 5600.00,
      ultimaCompra: "2024-01-20",
      status: "ativo",
    },
  ];

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "ativo":
        return "default";
      case "inativo":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getInitials = (nome: string) => {
    const parts = nome.split(" ");
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR");
  };

  const totalFornecedores = fornecedores.length;
  const fornecedoresAtivos = fornecedores.filter(f => f.status === "ativo").length;
  const totalCompras = fornecedores.reduce((acc, f) => acc + f.totalCompras, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Fornecedores</h1>
          <p className="text-muted-foreground">
            Gerencie os fornecedores da ótica
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Novo Fornecedor
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Fornecedores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalFornecedores}</p>
            <p className="text-xs text-muted-foreground">
              {fornecedoresAtivos} ativos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total em Compras
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">
              {formatCurrency(totalCompras)}
            </p>
            <p className="text-xs text-muted-foreground">
              Acumulado
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
              {formatCurrency(totalCompras / totalFornecedores)}
            </p>
            <p className="text-xs text-muted-foreground">
              Por fornecedor
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>
            Busque fornecedores cadastrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, CNPJ ou categoria..."
                className="pl-9"
              />
            </div>
            <Button variant="outline">
              Todas Categorias
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Fornecedores Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Fornecedores</CardTitle>
          <CardDescription>
            {fornecedores.length} fornecedores cadastrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Localização</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Total Compras</TableHead>
                <TableHead className="text-center">Última Compra</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fornecedores.map((fornecedor) => (
                <TableRow key={fornecedor.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback className="bg-blue-100 text-blue-600">
                          {getInitials(fornecedor.nome)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{fornecedor.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          CNPJ: {fornecedor.cnpj}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="text-sm flex items-center gap-1">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        {fornecedor.email}
                      </p>
                      <p className="text-sm flex items-center gap-1">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        {fornecedor.telefone}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="text-sm flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        {fornecedor.endereco}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fornecedor.cidade} - {fornecedor.estado}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{fornecedor.categoria}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="space-y-1">
                      <p className="font-semibold">
                        {formatCurrency(fornecedor.totalCompras)}
                      </p>
                      <div className="flex items-center justify-end gap-1 text-xs text-green-600">
                        <TrendingUp className="h-3 w-3" />
                        <span>Ativo</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {formatDate(fornecedor.ultimaCompra)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={getStatusVariant(fornecedor.status)}>
                      {fornecedor.status === "ativo" ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
