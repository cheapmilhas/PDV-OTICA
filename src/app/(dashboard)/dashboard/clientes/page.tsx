"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Search,
  Plus,
  Eye,
  Phone,
  Mail,
  Calendar,
  Upload,
  Download,
  Building2,
  ShoppingBag,
  AlertTriangle
} from "lucide-react";
import { formatCPF } from "@/lib/utils";
import { ModalDetalhesCliente } from "@/components/clientes/modal-detalhes-cliente";
import Link from "next/link";

export default function ClientesPage() {
  const [clienteSelecionado, setClienteSelecionado] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("ativos");
  const [filtroOrigem, setFiltroOrigem] = useState("todas");
  const [filtroCidade, setFiltroCidade] = useState("");

  const visualizarCliente = (cliente: any) => {
    setClienteSelecionado(cliente);
    setModalOpen(true);
  };

  // Mock data - clientes realistas para ótica (estilo SSÓtica)
  const clientes = [
    {
      id: "1",
      nome: "Maria Adelaide Faco",
      email: "maria.faco@email.com",
      telefone: "(85) 98529-2608",
      cpf: "12345678901",
      dataNascimento: "1985-03-15",
      dataCadastro: "2024-03-04",
      ultimaCompra: "2024-01-28",
      totalCompras: 1,
      valorTotal: 190.00,
      status: "active",
      filial: "Ado Cascavel",
      cidade: "Cascavel-CE",
      origem: "Indicação",
      foto: null,
    },
    {
      id: "2",
      nome: "Abel Jackson Lopes dos Santos",
      email: "abel.lopes@email.com",
      telefone: "(85) 99264-2481",
      cpf: "23456789012",
      dataNascimento: "1992-07-22",
      dataCadastro: "2020-01-25",
      ultimaCompra: "2024-01-30",
      totalCompras: 1,
      valorTotal: 1249.90,
      status: "active",
      filial: "Ado Pacajus",
      cidade: "Pacajus-CE",
      origem: "Indicação",
      foto: null,
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

  // Filtrar clientes
  const clientesFiltrados = clientes.filter((cliente) => {
    const matchBusca =
      cliente.nome.toLowerCase().includes(busca.toLowerCase()) ||
      cliente.email.toLowerCase().includes(busca.toLowerCase()) ||
      cliente.telefone.includes(busca) ||
      cliente.cpf.includes(busca);

    const matchStatus =
      filtroStatus === "todos" ||
      (filtroStatus === "ativos" && cliente.status !== "inactive") ||
      (filtroStatus === "inativos" && cliente.status === "inactive");

    const matchCidade =
      !filtroCidade || cliente.cidade?.toLowerCase().includes(filtroCidade.toLowerCase());

    return matchBusca && matchStatus && matchCidade;
  });

  return (
    <div className="space-y-6">
      {/* Banner de Aviso */}
      <div className="rounded-lg border border-red-300 bg-red-50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-200">
              <AlertTriangle className="h-5 w-5 text-red-700" />
            </div>
            <div>
              <p className="font-medium text-red-900">
                <strong>Aviso:</strong> Estamos adotando uma nova política de senhas para proteger ainda mais sua conta. Atualize sua senha agora e mantenha sua segurança em dia.
              </p>
            </div>
          </div>
          <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white">
            Alterar Senha
          </Button>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Clientes</h1>
          <p className="text-muted-foreground">
            Gerencie os clientes da ótica
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Upload className="mr-2 h-4 w-4" />
            Importar Clientes
          </Button>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Novo Cliente
          </Button>
        </div>
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

      {/* Filters - Estilo SSÓtica */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Busca</CardTitle>
              <CardDescription className="text-xs mt-1">
                Para garantir a importação, envie um arquivo no formato Excel(.xlsx) com no máximo 1.000 linhas.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Busque por código externo, nome, apelido, e-mail, telefone ou documento"
              className="pl-9"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Origem do Cliente</label>
              <Select value={filtroOrigem} onValueChange={setFiltroOrigem}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha uma opção" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="indicacao">Indicação</SelectItem>
                  <SelectItem value="redes-sociais">Redes Sociais</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Mostrar Clientes</label>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="ativos">Somente Ativos</SelectItem>
                  <SelectItem value="inativos">Inativos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Cidade</label>
              <Input
                placeholder="Selecione uma cidade..."
                value={filtroCidade}
                onChange={(e) => setFiltroCidade(e.target.value)}
              />
            </div>

            <div className="flex items-end">
              <Button className="w-full">
                <Search className="mr-2 h-4 w-4" />
                Buscar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Botões de Exportar */}
      <div className="flex gap-2">
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Exportar Clientes
        </Button>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Exportar Receitas
        </Button>
      </div>

      {/* Resultado da busca */}
      <p className="text-sm text-muted-foreground">
        Foram encontrados <strong>{clientesFiltrados.length} clientes ativos</strong>. Mostrando página 1 de {Math.ceil(clientesFiltrados.length / 20)}.
      </p>

      {/* Lista de Clientes em Cards - Estilo SSÓtica */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {clientesFiltrados.map((cliente) => (
          <Card key={cliente.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => visualizarCliente(cliente)}>
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                {/* Avatar/Foto */}
                <Avatar className="h-16 w-16">
                  {(cliente as any).foto ? (
                    <AvatarImage src={(cliente as any).foto} alt={cliente.nome} />
                  ) : (
                    <AvatarFallback className="text-lg">{getInitials(cliente.nome)}</AvatarFallback>
                  )}
                </Avatar>

                {/* Informações */}
                <div className="flex-1 space-y-2">
                  <div>
                    <h3 className="font-semibold text-lg">{cliente.nome}</h3>
                    {(cliente as any).filial && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {(cliente as any).filial}
                      </p>
                    )}
                  </div>

                  {(cliente as any).dataCadastro && (
                    <p className="text-xs text-muted-foreground">
                      {formatDate((cliente as any).dataCadastro)}
                    </p>
                  )}

                  <div className="space-y-1">
                    <p className="text-sm flex items-center gap-1">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      {cliente.telefone}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <Badge variant="default" className="bg-blue-500">
                      {cliente.totalCompras} Venda{cliente.totalCompras !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Paginação */}
      <div className="flex justify-center gap-2 mt-6">
        <Button variant="outline" size="sm">«</Button>
        {[...Array(Math.min(5, Math.ceil(clientesFiltrados.length / 20)))].map((_, i) => (
          <Button key={i} variant={i === 0 ? "default" : "outline"} size="sm">
            {i + 1}
          </Button>
        ))}
        <Button variant="outline" size="sm">...</Button>
        <Button variant="outline" size="sm">{Math.ceil(clientesFiltrados.length / 20)}</Button>
        <Button variant="outline" size="sm">»</Button>
      </div>

      <ModalDetalhesCliente
        open={modalOpen}
        onOpenChange={setModalOpen}
        cliente={clienteSelecionado}
      />
    </div>
  );
}
