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
import { Search, Plus, Eye, Phone, Mail, Calendar } from "lucide-react";
import { formatCPF } from "@/lib/utils";
import { ModalDetalhesCliente } from "@/components/clientes/modal-detalhes-cliente";

export default function ClientesPage() {
  const [clienteSelecionado, setClienteSelecionado] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const visualizarCliente = (cliente: any) => {
    setClienteSelecionado(cliente);
    setModalOpen(true);
  };

  // Mock data - clientes realistas para ótica
  const clientes = [
    {
      id: "1",
      nome: "Maria Silva Santos",
      email: "maria.santos@email.com",
      telefone: "(11) 98765-4321",
      cpf: "12345678901",
      dataNascimento: "1985-03-15",
      ultimaCompra: "2024-01-28",
      totalCompras: 3,
      valorTotal: 2850.50,
      status: "active",
    },
    {
      id: "2",
      nome: "João Pedro Oliveira",
      email: "joao.oliveira@email.com",
      telefone: "(11) 97654-3210",
      cpf: "23456789012",
      dataNascimento: "1992-07-22",
      ultimaCompra: "2024-01-30",
      totalCompras: 1,
      valorTotal: 1249.90,
      status: "active",
    },
    {
      id: "3",
      nome: "Ana Paula Costa",
      email: "ana.costa@email.com",
      telefone: "(11) 96543-2109",
      cpf: "34567890123",
      dataNascimento: "1978-11-05",
      ultimaCompra: "2024-01-25",
      totalCompras: 5,
      valorTotal: 4120.00,
      status: "active",
    },
    {
      id: "4",
      nome: "Carlos Eduardo Lima",
      email: "carlos.lima@email.com",
      telefone: "(11) 95432-1098",
      cpf: "45678901234",
      dataNascimento: "1995-02-18",
      ultimaCompra: "2024-01-15",
      totalCompras: 2,
      valorTotal: 1680.00,
      status: "active",
    },
    {
      id: "5",
      nome: "Juliana Ferreira Souza",
      email: "juliana.souza@email.com",
      telefone: "(11) 94321-0987",
      cpf: "56789012345",
      dataNascimento: "1988-09-30",
      ultimaCompra: "2024-01-29",
      totalCompras: 7,
      valorTotal: 6340.90,
      status: "vip",
    },
    {
      id: "6",
      nome: "Roberto Carlos Almeida",
      email: "roberto.almeida@email.com",
      telefone: "(11) 93210-9876",
      cpf: "67890123456",
      dataNascimento: "1970-04-12",
      ultimaCompra: "2023-11-20",
      totalCompras: 2,
      valorTotal: 1580.00,
      status: "inactive",
    },
    {
      id: "7",
      nome: "Patrícia Mendes Rocha",
      email: "patricia.rocha@email.com",
      telefone: "(11) 92109-8765",
      cpf: "78901234567",
      dataNascimento: "1990-06-25",
      ultimaCompra: "2024-01-27",
      totalCompras: 4,
      valorTotal: 3290.00,
      status: "active",
    },
    {
      id: "8",
      nome: "Fernando Augusto Dias",
      email: "fernando.dias@email.com",
      telefone: "(11) 91098-7654",
      cpf: "89012345678",
      dataNascimento: "1982-12-08",
      ultimaCompra: "2024-01-24",
      totalCompras: 6,
      valorTotal: 5670.50,
      status: "vip",
    },
    {
      id: "9",
      nome: "Camila Rodrigues Martins",
      email: "camila.martins@email.com",
      telefone: "(11) 90987-6543",
      cpf: "90123456789",
      dataNascimento: "1998-01-14",
      ultimaCompra: "2024-01-31",
      totalCompras: 1,
      valorTotal: 899.90,
      status: "active",
    },
    {
      id: "10",
      nome: "Ricardo Henrique Barbosa",
      email: "ricardo.barbosa@email.com",
      telefone: "(11) 89876-5432",
      cpf: "01234567890",
      dataNascimento: "1975-08-19",
      ultimaCompra: "2024-01-20",
      totalCompras: 3,
      valorTotal: 2450.00,
      status: "active",
    },
  ];

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "vip":
        return "default";
      case "active":
        return "secondary";
      case "inactive":
        return "outline";
      default:
        return "secondary";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "vip":
        return "VIP";
      case "active":
        return "Ativo";
      case "inactive":
        return "Inativo";
      default:
        return status;
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const clientesAtivos = clientes.filter((c) => c.status !== "inactive").length;
  const clientesVip = clientes.filter((c) => c.status === "vip").length;
  const ticketMedio =
    clientes.reduce((acc, c) => acc + c.valorTotal, 0) / clientes.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Clientes</h1>
          <p className="text-muted-foreground">
            Gerencie os clientes da ótica
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Novo Cliente
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Clientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{clientes.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Clientes Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{clientesAtivos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Clientes VIP
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{clientesVip}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ticket Médio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(ticketMedio)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>
            Busque e filtre clientes cadastrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, email, telefone ou CPF..."
                className="pl-9"
              />
            </div>
            <Button variant="outline">
              Todos os Status
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Customers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Clientes</CardTitle>
          <CardDescription>
            {clientes.length} clientes cadastrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead className="text-center">Compras</TableHead>
                <TableHead className="text-right">Total Gasto</TableHead>
                <TableHead className="text-center">Última Compra</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientes.map((cliente) => (
                <TableRow key={cliente.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>{getInitials(cliente.nome)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{cliente.nome}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(cliente.dataNascimento)}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="text-sm flex items-center gap-1">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        {cliente.email}
                      </p>
                      <p className="text-sm flex items-center gap-1">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        {cliente.telefone}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {formatCPF(cliente.cpf)}
                  </TableCell>
                  <TableCell className="text-center font-medium">
                    {cliente.totalCompras}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(cliente.valorTotal)}
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {formatDate(cliente.ultimaCompra)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={getStatusVariant(cliente.status)}>
                      {getStatusLabel(cliente.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => visualizarCliente(cliente)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ModalDetalhesCliente
        open={modalOpen}
        onOpenChange={setModalOpen}
        cliente={clienteSelecionado}
      />
    </div>
  );
}
