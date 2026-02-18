"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Eye, Mail, Phone, Globe, Loader2, Edit, Trash2, FlaskConical, AlertTriangle, Star, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";

interface Laboratory {
  id: string;
  name: string;
  code?: string | null;
  cnpj?: string | null;
  phone?: string | null;
  email?: string | null;
  orderEmail?: string | null;
  website?: string | null;
  contactPerson?: string | null;
  defaultLeadTimeDays: number;
  urgentLeadTimeDays: number;
  paymentTermDays: number;
  defaultDiscount: number;
  qualityRating?: number | null;
  totalOrders: number;
  totalReworks: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

function LaboratoriosPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [laboratories, setLaboratories] = useState<Laboratory[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLab, setSelectedLab] = useState<Laboratory | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Laboratory>>({});
  const [labOrders, setLabOrders] = useState<any[]>([]);
  const [loadingLabOrders, setLoadingLabOrders] = useState(false);
  const [createForm, setCreateForm] = useState<Partial<Laboratory>>({
    defaultLeadTimeDays: 7,
    urgentLeadTimeDays: 3,
    paymentTermDays: 30,
    defaultDiscount: 0,
  });

  // Buscar laboratórios da API
  useEffect(() => {
    fetchLaboratories();
  }, [search, page, statusFilter]);

  async function fetchLaboratories() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        page: page.toString(),
        pageSize: "20",
        status: statusFilter,
      });

      const res = await fetch(`/api/laboratories?${params}`);
      if (!res.ok) throw new Error("Erro ao buscar laboratórios");

      const data = await res.json();
      setLaboratories(data.data || []);
      setPagination(data.pagination);
    } catch (error: any) {
      console.error("Erro ao carregar laboratórios:", error);
      toast.error("Erro ao carregar laboratórios");
    } finally {
      setLoading(false);
    }
  }

  async function handleViewDetails(id: string) {
    setLoadingDetails(true);
    setDetailsDialogOpen(true);
    setIsEditing(false);
    setLabOrders([]);

    try {
      const [labRes, ordersRes] = await Promise.all([
        fetch(`/api/laboratories/${id}`),
        fetch(`/api/laboratories/${id}/service-orders`),
      ]);

      if (!labRes.ok) throw new Error("Erro ao buscar detalhes");

      const { data } = await labRes.json();
      setSelectedLab(data);
      setEditForm(data);

      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        setLabOrders(ordersData.data || []);
      }
    } catch (error: any) {
      console.error("Erro ao carregar detalhes:", error);
      toast.error("Erro ao carregar detalhes do laboratório");
      setDetailsDialogOpen(false);
    } finally {
      setLoadingDetails(false);
    }
  }

  function handleStartEdit() {
    setIsEditing(true);
  }

  function handleCancelEdit() {
    setIsEditing(false);
    if (selectedLab) {
      setEditForm(selectedLab);
    }
  }

  async function handleSaveEdit() {
    if (!selectedLab) return;

    const allowedFields = [
      'name', 'code', 'cnpj', 'phone', 'email', 'orderEmail',
      'website', 'contactPerson', 'defaultLeadTimeDays',
      'urgentLeadTimeDays', 'paymentTermDays', 'defaultDiscount', 'active'
    ];

    const updateData: any = {};
    for (const field of allowedFields) {
      if (field in editForm) {
        const value = (editForm as any)[field];
        updateData[field] = value === "" ? null : value;
      }
    }

    try {
      const res = await fetch(`/api/laboratories/${selectedLab.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Erro ao atualizar laboratório");
      }

      const { data } = await res.json();
      toast.success("Laboratório atualizado com sucesso!");
      setSelectedLab(data);
      setEditForm(data);
      setIsEditing(false);
      fetchLaboratories();
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar laboratório");
    }
  }

  async function handleCreate() {
    if (!createForm.name) {
      toast.error("Nome é obrigatório");
      return;
    }

    try {
      const res = await fetch("/api/laboratories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Erro ao criar laboratório");
      }

      toast.success("Laboratório criado com sucesso!");
      setCreateDialogOpen(false);
      setCreateForm({
        defaultLeadTimeDays: 7,
        urgentLeadTimeDays: 3,
        paymentTermDays: 30,
        defaultDiscount: 0,
      });
      fetchLaboratories();
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar laboratório");
    }
  }

  async function handleToggleStatus(id: string, currentStatus: boolean) {
    if (!confirm(`Tem certeza que deseja ${currentStatus ? "desativar" : "ativar"} este laboratório?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/laboratories/${id}`, {
        method: currentStatus ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: currentStatus ? undefined : JSON.stringify({ active: true }),
      });

      if (!res.ok) throw new Error("Erro ao atualizar laboratório");

      toast.success(`Laboratório ${currentStatus ? "desativado" : "ativado"} com sucesso!`);
      fetchLaboratories();
      setDetailsDialogOpen(false);
    } catch (error: any) {
      console.error("Erro ao atualizar laboratório:", error);
      toast.error(error.message || "Erro ao atualizar laboratório");
    }
  }

  const getInitials = (name: string) => {
    const parts = name.split(" ");
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR");
  };

  const totalLaboratorios = pagination?.total || 0;
  const laboratoriosAtivos = laboratories.filter(l => l.active).length;

  const calculateRating = (lab: Laboratory) => {
    if (lab.totalOrders === 0) return 0;
    const successRate = ((lab.totalOrders - lab.totalReworks) / lab.totalOrders) * 100;
    return Math.round(successRate);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Laboratórios</h1>
          <p className="text-muted-foreground">
            Gerencie os laboratórios parceiros
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Laboratório
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Laboratórios
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalLaboratorios}</p>
            <p className="text-xs text-muted-foreground">
              {laboratoriosAtivos} ativos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Laboratórios Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {laboratoriosAtivos}
            </p>
            <p className="text-xs text-muted-foreground">
              Parceiros ativos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Pedidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {laboratories.reduce((sum, lab) => sum + lab.totalOrders, 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              Pedidos realizados
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Buscar Laboratórios</CardTitle>
          <CardDescription>
            Pesquise por nome, código ou pessoa de contato
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Digite para buscar..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value: any) => {
              setStatusFilter(value);
              setPage(1);
            }}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Filtrar status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ativos">Ativos</SelectItem>
                <SelectItem value="inativos">Inativos</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!loading && laboratories.length === 0 && (
        <EmptyState
          icon={<FlaskConical className="h-12 w-12" />}
          title="Nenhum laboratório encontrado"
          description={
            search
              ? `Não encontramos resultados para "${search}"`
              : "Comece adicionando seu primeiro laboratório"
          }
        />
      )}

      {/* Laboratórios Table */}
      {!loading && laboratories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Lista de Laboratórios</CardTitle>
            <CardDescription>
              {pagination?.total || 0} laboratórios cadastrados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Laboratório</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Prazos</TableHead>
                  <TableHead className="text-center">Estatísticas</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {laboratories.map((lab) => (
                  <TableRow key={lab.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback className="bg-purple-100 text-purple-600">
                            {getInitials(lab.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{lab.name}</p>
                          {lab.code && (
                            <p className="text-xs text-muted-foreground">
                              Código: {lab.code}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {lab.contactPerson && (
                          <p className="text-sm font-medium">
                            {lab.contactPerson}
                          </p>
                        )}
                        {lab.phone && (
                          <p className="text-xs flex items-center gap-1">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {lab.phone}
                          </p>
                        )}
                        {lab.email && (
                          <p className="text-xs flex items-center gap-1">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            {lab.email}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span>Padrão: {lab.defaultLeadTimeDays}d</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 text-orange-500" />
                          <span>Urgente: {lab.urgentLeadTimeDays}d</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="space-y-1">
                        <div className="flex items-center justify-center gap-1 text-sm">
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          <span>{calculateRating(lab)}%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {lab.totalOrders} pedidos
                        </p>
                        {lab.totalReworks > 0 && (
                          <p className="text-xs text-orange-600">
                            {lab.totalReworks} retrabalhos
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={lab.active ? "default" : "secondary"}>
                        {lab.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetails(lab.id)}
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
      )}

      {/* Paginação */}
      {!loading && pagination && pagination.totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={pagination.totalPages}
          onPageChange={setPage}
          showInfo
        />
      )}

      {/* Modal de Detalhes */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Laboratório</DialogTitle>
            <DialogDescription>
              Informações completas do laboratório
            </DialogDescription>
          </DialogHeader>

          {loadingDetails ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : selectedLab ? (
            isEditing ? (
              // Modo de Edição
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome *</Label>
                    <Input
                      id="name"
                      value={editForm.name || ""}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="code">Código</Label>
                    <Input
                      id="code"
                      value={editForm.code || ""}
                      onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cnpj">CNPJ</Label>
                    <Input
                      id="cnpj"
                      value={editForm.cnpj || ""}
                      onChange={(e) => setEditForm({ ...editForm, cnpj: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactPerson">Pessoa de Contato</Label>
                    <Input
                      id="contactPerson"
                      value={editForm.contactPerson || ""}
                      onChange={(e) => setEditForm({ ...editForm, contactPerson: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      value={editForm.phone || ""}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={editForm.email || ""}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="orderEmail">Email para Pedidos</Label>
                    <Input
                      id="orderEmail"
                      type="email"
                      value={editForm.orderEmail || ""}
                      onChange={(e) => setEditForm({ ...editForm, orderEmail: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      value={editForm.website || ""}
                      onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="defaultLeadTimeDays">Prazo Padrão (dias)</Label>
                    <Input
                      id="defaultLeadTimeDays"
                      type="number"
                      min="1"
                      value={editForm.defaultLeadTimeDays || 7}
                      onChange={(e) => setEditForm({ ...editForm, defaultLeadTimeDays: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="urgentLeadTimeDays">Prazo Urgente (dias)</Label>
                    <Input
                      id="urgentLeadTimeDays"
                      type="number"
                      min="1"
                      value={editForm.urgentLeadTimeDays || 3}
                      onChange={(e) => setEditForm({ ...editForm, urgentLeadTimeDays: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="paymentTermDays">Prazo Pagamento (dias)</Label>
                    <Input
                      id="paymentTermDays"
                      type="number"
                      min="0"
                      value={editForm.paymentTermDays || 30}
                      onChange={(e) => setEditForm({ ...editForm, paymentTermDays: parseInt(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="defaultDiscount">Desconto Padrão (%)</Label>
                  <Input
                    id="defaultDiscount"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={editForm.defaultDiscount || 0}
                    onChange={(e) => setEditForm({ ...editForm, defaultDiscount: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
            ) : (
              // Modo de Visualização
              <div className="space-y-6">
                {/* Dados Principais */}
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16">
                      <AvatarFallback className="bg-purple-100 text-purple-600 text-xl">
                        {getInitials(selectedLab.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold">{selectedLab.name}</h3>
                      {selectedLab.code && (
                        <p className="text-sm text-muted-foreground">Código: {selectedLab.code}</p>
                      )}
                      <Badge variant={selectedLab.active ? "default" : "secondary"} className="mt-2">
                        {selectedLab.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                  </div>

                  {/* CNPJ */}
                  {selectedLab.cnpj && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">CNPJ</p>
                      <p className="text-sm">{selectedLab.cnpj}</p>
                    </div>
                  )}

                  {/* Contato */}
                  <div className="grid gap-4 md:grid-cols-2">
                    {selectedLab.contactPerson && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Pessoa de Contato</p>
                        <p className="text-sm">{selectedLab.contactPerson}</p>
                      </div>
                    )}
                    {selectedLab.phone && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" /> Telefone
                        </p>
                        <p className="text-sm">{selectedLab.phone}</p>
                      </div>
                    )}
                    {selectedLab.email && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" /> Email
                        </p>
                        <p className="text-sm">{selectedLab.email}</p>
                      </div>
                    )}
                    {selectedLab.orderEmail && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" /> Email para Pedidos
                        </p>
                        <p className="text-sm">{selectedLab.orderEmail}</p>
                      </div>
                    )}
                    {selectedLab.website && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                          <Globe className="h-3 w-3" /> Website
                        </p>
                        <p className="text-sm">{selectedLab.website}</p>
                      </div>
                    )}
                  </div>

                  {/* Prazos e Condições */}
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Prazos e Condições</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>Prazo Padrão: {selectedLab.defaultLeadTimeDays} dias</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                        <span>Prazo Urgente: {selectedLab.urgentLeadTimeDays} dias</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span>Prazo de Pagamento: {selectedLab.paymentTermDays} dias</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span>Desconto Padrão: {selectedLab.defaultDiscount}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Estatísticas */}
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Estatísticas</p>
                    <div className="grid gap-4 md:grid-cols-3">
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-center">
                            <p className="text-2xl font-bold">{loadingLabOrders ? "..." : labOrders.length || selectedLab.totalOrders}</p>
                            <p className="text-xs text-muted-foreground">Total de Pedidos</p>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-center">
                            <p className="text-2xl font-bold text-orange-600">{selectedLab.totalReworks}</p>
                            <p className="text-xs text-muted-foreground">Retrabalhos</p>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                              <p className="text-2xl font-bold">{calculateRating(selectedLab)}%</p>
                            </div>
                            <p className="text-xs text-muted-foreground">Taxa de Sucesso</p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  {/* Ordens de Serviço Vinculadas */}
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">
                      Ordens de Serviço Vinculadas ({labOrders.length})
                    </p>
                    {labOrders.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">Nenhuma OS vinculada a este laboratório</p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {labOrders.map((os: any) => {
                          const isDelayed = os.promisedDate && new Date(os.promisedDate) < new Date() && !["DELIVERED", "CANCELED"].includes(os.status);
                          return (
                            <div key={os.id} className={`flex items-center justify-between rounded-lg border p-2 text-sm ${isDelayed ? "border-red-200 bg-red-50" : "border-gray-100 bg-gray-50"}`}>
                              <div>
                                <span className="font-mono font-medium">OS #{String(os.number).padStart(5, "0")}</span>
                                <span className="text-muted-foreground ml-2">{os.customer?.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {isDelayed && <span className="text-xs text-red-600 font-medium">Atrasada</span>}
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  os.status === "DELIVERED" ? "bg-green-100 text-green-700" :
                                  os.status === "SENT_TO_LAB" ? "bg-purple-100 text-purple-700" :
                                  os.status === "IN_PROGRESS" ? "bg-yellow-100 text-yellow-700" :
                                  os.status === "READY" ? "bg-blue-100 text-blue-700" :
                                  "bg-gray-100 text-gray-700"
                                }`}>
                                  {os.status === "SENT_TO_LAB" ? "No Lab" : os.status === "IN_PROGRESS" ? "Em Produção" : os.status === "READY" ? "Pronta" : os.status === "DELIVERED" ? "Entregue" : os.status}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Datas */}
                  <div className="grid gap-4 md:grid-cols-2 text-xs text-muted-foreground">
                    <div>
                      <p className="font-medium">Cadastrado em</p>
                      <p>{formatDate(selectedLab.createdAt)}</p>
                    </div>
                    <div>
                      <p className="font-medium">Última atualização</p>
                      <p>{formatDate(selectedLab.updatedAt)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )
          ) : null}

          <DialogFooter className="gap-2">
            {isEditing ? (
              <>
                <Button variant="outline" onClick={handleCancelEdit}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveEdit}>
                  Salvar Alterações
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setDetailsDialogOpen(false)}
                >
                  Fechar
                </Button>
                {selectedLab && (
                  <>
                    <Button
                      variant={selectedLab.active ? "destructive" : "default"}
                      onClick={() => handleToggleStatus(selectedLab.id, selectedLab.active)}
                    >
                      {selectedLab.active ? (
                        <>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Desativar
                        </>
                      ) : (
                        "Ativar"
                      )}
                    </Button>
                    <Button onClick={handleStartEdit}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                  </>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Criação */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Laboratório</DialogTitle>
            <DialogDescription>
              Cadastre um novo laboratório parceiro
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="create-name">Nome *</Label>
                <Input
                  id="create-name"
                  value={createForm.name || ""}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="Nome do laboratório"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-code">Código</Label>
                <Input
                  id="create-code"
                  value={createForm.code || ""}
                  onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
                  placeholder="Código identificador"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="create-cnpj">CNPJ</Label>
                <Input
                  id="create-cnpj"
                  value={createForm.cnpj || ""}
                  onChange={(e) => setCreateForm({ ...createForm, cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-contactPerson">Pessoa de Contato</Label>
                <Input
                  id="create-contactPerson"
                  value={createForm.contactPerson || ""}
                  onChange={(e) => setCreateForm({ ...createForm, contactPerson: e.target.value })}
                  placeholder="Nome do responsável"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="create-phone">Telefone</Label>
                <Input
                  id="create-phone"
                  value={createForm.phone || ""}
                  onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-email">Email</Label>
                <Input
                  id="create-email"
                  type="email"
                  value={createForm.email || ""}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="contato@laboratorio.com"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="create-orderEmail">Email para Pedidos</Label>
                <Input
                  id="create-orderEmail"
                  type="email"
                  value={createForm.orderEmail || ""}
                  onChange={(e) => setCreateForm({ ...createForm, orderEmail: e.target.value })}
                  placeholder="pedidos@laboratorio.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-website">Website</Label>
                <Input
                  id="create-website"
                  value={createForm.website || ""}
                  onChange={(e) => setCreateForm({ ...createForm, website: e.target.value })}
                  placeholder="https://www.laboratorio.com"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="create-defaultLeadTimeDays">Prazo Padrão (dias)</Label>
                <Input
                  id="create-defaultLeadTimeDays"
                  type="number"
                  min="1"
                  value={createForm.defaultLeadTimeDays || 7}
                  onChange={(e) => setCreateForm({ ...createForm, defaultLeadTimeDays: parseInt(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-urgentLeadTimeDays">Prazo Urgente (dias)</Label>
                <Input
                  id="create-urgentLeadTimeDays"
                  type="number"
                  min="1"
                  value={createForm.urgentLeadTimeDays || 3}
                  onChange={(e) => setCreateForm({ ...createForm, urgentLeadTimeDays: parseInt(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-paymentTermDays">Prazo Pagamento (dias)</Label>
                <Input
                  id="create-paymentTermDays"
                  type="number"
                  min="0"
                  value={createForm.paymentTermDays || 30}
                  onChange={(e) => setCreateForm({ ...createForm, paymentTermDays: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-defaultDiscount">Desconto Padrão (%)</Label>
              <Input
                id="create-defaultDiscount"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={createForm.defaultDiscount || 0}
                onChange={(e) => setCreateForm({ ...createForm, defaultDiscount: parseFloat(e.target.value) })}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false);
                setCreateForm({
                  defaultLeadTimeDays: 7,
                  urgentLeadTimeDays: 3,
                  paymentTermDays: 30,
                  defaultDiscount: 0,
                });
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Laboratório
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="laboratories.view">
      <LaboratoriosPage />
    </ProtectedRoute>
  );
}
