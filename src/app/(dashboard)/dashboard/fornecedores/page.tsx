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
import { Search, Plus, Eye, Mail, Phone, MapPin, TrendingUp, Loader2, Edit, Trash2, Package, AlertTriangle, Download, Upload, FileDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { usePermissions } from "@/hooks/usePermissions";

interface Supplier {
  id: string;
  name: string;
  tradeName?: string | null;
  cnpj?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  contactPerson?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  notes?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

function FornecedoresPage() {
  const { hasPermission } = usePermissions();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Supplier>>({});
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Buscar fornecedores da API
  useEffect(() => {
    fetchSuppliers();
  }, [search, page, statusFilter]);

  async function fetchSuppliers() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        page: page.toString(),
        pageSize: "20",
        status: statusFilter,
      });

      const res = await fetch(`/api/suppliers?${params}`);
      if (!res.ok) throw new Error("Erro ao buscar fornecedores");

      const data = await res.json();
      setSuppliers(data.data || []);
      setPagination(data.pagination);
    } catch (error: any) {
      console.error("Erro ao carregar fornecedores:", error);
      toast.error("Erro ao carregar fornecedores");
    } finally {
      setLoading(false);
    }
  }

  async function handleViewDetails(id: string) {
    setLoadingDetails(true);
    setDetailsDialogOpen(true);
    setIsEditing(false);

    try {
      const res = await fetch(`/api/suppliers/${id}`);
      if (!res.ok) throw new Error("Erro ao buscar detalhes");

      const { data } = await res.json();
      setSelectedSupplier(data);
      setEditForm(data);
    } catch (error: any) {
      console.error("Erro ao carregar detalhes:", error);
      toast.error("Erro ao carregar detalhes do fornecedor");
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
    if (selectedSupplier) {
      setEditForm(selectedSupplier);
    }
  }

  async function handleSaveEdit() {
    if (!selectedSupplier) return;

    // Filtrar apenas os campos permitidos para atualização
    const allowedFields = [
      'name', 'tradeName', 'cnpj', 'phone', 'email',
      'website', 'contactPerson', 'address', 'city',
      'state', 'zipCode', 'notes', 'active'
    ];

    const updateData: any = {};
    for (const field of allowedFields) {
      if (field in editForm) {
        const value = (editForm as any)[field];
        // Converter strings vazias em null para campos opcionais
        updateData[field] = value === "" ? null : value;
      }
    }

    try {
      const res = await fetch(`/api/suppliers/${selectedSupplier.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Erro ao atualizar fornecedor");
      }

      const { data } = await res.json();
      toast.success("Fornecedor atualizado com sucesso!");
      setSelectedSupplier(data);
      setEditForm(data);
      setIsEditing(false);
      fetchSuppliers();
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar fornecedor");
    }
  }

  async function handleToggleStatus(id: string, currentStatus: boolean) {
    if (!confirm(`Tem certeza que deseja ${currentStatus ? "desativar" : "ativar"} este fornecedor?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/suppliers/${id}`, {
        method: currentStatus ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: currentStatus ? undefined : JSON.stringify({ active: true }),
      });

      if (!res.ok) throw new Error("Erro ao atualizar fornecedor");

      toast.success(`Fornecedor ${currentStatus ? "desativado" : "ativado"} com sucesso!`);
      fetchSuppliers();
      setDetailsDialogOpen(false);
    } catch (error: any) {
      console.error("Erro ao atualizar fornecedor:", error);
      toast.error(error.message || "Erro ao atualizar fornecedor");
    }
  }

  async function handlePermanentDelete(id: string) {
    if (!confirm("⚠️ ATENÇÃO: Esta ação é IRREVERSÍVEL!\n\nTem certeza que deseja EXCLUIR PERMANENTEMENTE este fornecedor do banco de dados?\n\nTodos os dados serão perdidos e não poderão ser recuperados.")) {
      return;
    }

    try {
      const res = await fetch(`/api/suppliers/${id}?permanent=true`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Erro ao excluir fornecedor");

      toast.success("Fornecedor excluído permanentemente!");
      fetchSuppliers();
      setDetailsDialogOpen(false);
    } catch (error: any) {
      console.error("Erro ao excluir fornecedor:", error);
      toast.error(error.message || "Erro ao excluir fornecedor");
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

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/suppliers/export");
      if (!res.ok) throw new Error("Erro ao exportar fornecedores");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fornecedores_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("Fornecedores exportados com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao exportar fornecedores");
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch("/api/suppliers/template");
      if (!res.ok) throw new Error("Erro ao baixar template");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "template_importacao_fornecedores.xlsx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("Template baixado com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao baixar template");
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/suppliers/import", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Erro ao importar fornecedores");
      }

      const result = await res.json();
      toast.success(
        `${result.message}\n\n` +
        `✓ ${result.results.created.length} criados\n` +
        `↻ ${result.results.updated.length} atualizados\n` +
        (result.results.errors.length > 0 ? `✗ ${result.results.errors.length} erros` : ""),
        { duration: 5000 }
      );

      if (result.results.errors.length > 0) {
        console.log("Erros de importação:", result.results.errors);
      }

      // Recarregar lista
      fetchSuppliers();
    } catch (error: any) {
      toast.error(error.message || "Erro ao importar fornecedores");
    } finally {
      setImporting(false);
      // Limpar input
      event.target.value = "";
    }
  };

  const totalFornecedores = pagination?.total || 0;
  const fornecedoresAtivos = suppliers.filter(s => s.active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Fornecedores</h1>
          <p className="text-muted-foreground">
            Gerencie os fornecedores da ótica
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleDownloadTemplate}>
            <FileDown className="mr-2 h-4 w-4" />
            Baixar Template
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Exportar
          </Button>
          {hasPermission("suppliers.view") && (
            <Button variant="outline" disabled={importing} asChild>
              <label className="cursor-pointer">
                {importing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Importar
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImport}
                  className="hidden"
                  disabled={importing}
                />
              </label>
            </Button>
          )}
          {hasPermission("suppliers.view") && (
            <Button onClick={() => toast("Em desenvolvimento")}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Fornecedor
            </Button>
          )}
        </div>
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
              Fornecedores Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {fornecedoresAtivos}
            </p>
            <p className="text-xs text-muted-foreground">
              Cadastros ativos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cadastros Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {suppliers.filter(s => {
                const days = (Date.now() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60 * 24);
                return days <= 30;
              }).length}
            </p>
            <p className="text-xs text-muted-foreground">
              Últimos 30 dias
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Buscar Fornecedores</CardTitle>
          <CardDescription>
            Pesquise por nome, CNPJ, email ou telefone
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
      {!loading && suppliers.length === 0 && (
        <EmptyState
          icon={<Package className="h-12 w-12" />}
          title="Nenhum fornecedor encontrado"
          description={
            search
              ? `Não encontramos resultados para "${search}"`
              : "Comece adicionando seu primeiro fornecedor"
          }
        />
      )}

      {/* Fornecedores Table */}
      {!loading && suppliers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Lista de Fornecedores</CardTitle>
            <CardDescription>
              {pagination?.total || 0} fornecedores cadastrados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback className="bg-blue-100 text-blue-600">
                            {getInitials(supplier.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{supplier.name}</p>
                          {supplier.cnpj && (
                            <p className="text-xs text-muted-foreground">
                              CNPJ: {supplier.cnpj}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {supplier.email && (
                          <p className="text-sm flex items-center gap-1">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            {supplier.email}
                          </p>
                        )}
                        {supplier.phone && (
                          <p className="text-sm flex items-center gap-1">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {supplier.phone}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {supplier.city || supplier.state ? (
                        <div className="space-y-1">
                          {supplier.address && (
                            <p className="text-sm flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              {supplier.address}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {supplier.city}{supplier.city && supplier.state ? " - " : ""}{supplier.state}
                          </p>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={supplier.active ? "default" : "secondary"}>
                        {supplier.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetails(supplier.id)}
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Fornecedor</DialogTitle>
            <DialogDescription>
              Informações completas do fornecedor
            </DialogDescription>
          </DialogHeader>

          {loadingDetails ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : selectedSupplier ? (
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
                    <Label htmlFor="tradeName">Nome Fantasia</Label>
                    <Input
                      id="tradeName"
                      value={editForm.tradeName || ""}
                      onChange={(e) => setEditForm({ ...editForm, tradeName: e.target.value })}
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
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={editForm.email || ""}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      value={editForm.phone || ""}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    value={editForm.website || ""}
                    onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Endereço</Label>
                  <Input
                    id="address"
                    value={editForm.address || ""}
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="city">Cidade</Label>
                    <Input
                      id="city"
                      value={editForm.city || ""}
                      onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">Estado</Label>
                    <Input
                      id="state"
                      value={editForm.state || ""}
                      onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zipCode">CEP</Label>
                    <Input
                      id="zipCode"
                      value={editForm.zipCode || ""}
                      onChange={(e) => setEditForm({ ...editForm, zipCode: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Observações</Label>
                  <Input
                    id="notes"
                    value={editForm.notes || ""}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
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
                      <AvatarFallback className="bg-blue-100 text-blue-600 text-xl">
                        {getInitials(selectedSupplier.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold">{selectedSupplier.name}</h3>
                      {selectedSupplier.tradeName && (
                        <p className="text-sm text-muted-foreground">{selectedSupplier.tradeName}</p>
                      )}
                      <Badge variant={selectedSupplier.active ? "default" : "secondary"} className="mt-2">
                        {selectedSupplier.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                  </div>

                  {/* CNPJ */}
                  {selectedSupplier.cnpj && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">CNPJ</p>
                      <p className="text-sm">{selectedSupplier.cnpj}</p>
                    </div>
                  )}

                  {/* Contato */}
                  <div className="grid gap-4 md:grid-cols-2">
                    {selectedSupplier.email && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" /> Email
                        </p>
                        <p className="text-sm">{selectedSupplier.email}</p>
                      </div>
                    )}
                    {selectedSupplier.phone && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" /> Telefone
                        </p>
                        <p className="text-sm">{selectedSupplier.phone}</p>
                      </div>
                    )}
                    {selectedSupplier.website && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Website</p>
                        <p className="text-sm">{selectedSupplier.website}</p>
                      </div>
                    )}
                    {selectedSupplier.contactPerson && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Contato</p>
                        <p className="text-sm">{selectedSupplier.contactPerson}</p>
                      </div>
                    )}
                  </div>

                  {/* Endereço */}
                  {(selectedSupplier.address || selectedSupplier.city || selectedSupplier.state) && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Endereço
                      </p>
                      {selectedSupplier.address && <p className="text-sm">{selectedSupplier.address}</p>}
                      {(selectedSupplier.city || selectedSupplier.state) && (
                        <p className="text-sm text-muted-foreground">
                          {selectedSupplier.city}{selectedSupplier.city && selectedSupplier.state ? " - " : ""}{selectedSupplier.state}
                          {selectedSupplier.zipCode && ` - CEP: ${selectedSupplier.zipCode}`}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Observações */}
                  {selectedSupplier.notes && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Observações</p>
                      <p className="text-sm">{selectedSupplier.notes}</p>
                    </div>
                  )}

                  {/* Datas */}
                  <div className="grid gap-4 md:grid-cols-2 text-xs text-muted-foreground">
                    <div>
                      <p className="font-medium">Cadastrado em</p>
                      <p>{formatDate(selectedSupplier.createdAt)}</p>
                    </div>
                    <div>
                      <p className="font-medium">Última atualização</p>
                      <p>{formatDate(selectedSupplier.updatedAt)}</p>
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
                {selectedSupplier && (
                  <>
                    {!selectedSupplier.active && hasPermission("suppliers.view") && (
                      <Button
                        variant="destructive"
                        onClick={() => handlePermanentDelete(selectedSupplier.id)}
                      >
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Excluir Permanentemente
                      </Button>
                    )}
                    {hasPermission("suppliers.view") && (
                      <Button
                        variant={selectedSupplier.active ? "destructive" : "default"}
                        onClick={() => handleToggleStatus(selectedSupplier.id, selectedSupplier.active)}
                      >
                        {selectedSupplier.active ? (
                          <>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Desativar
                          </>
                        ) : (
                          "Ativar"
                        )}
                      </Button>
                    )}
                    {hasPermission("suppliers.view") && (
                      <Button onClick={handleStartEdit}>
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </Button>
                    )}
                  </>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="suppliers.view">
      <FornecedoresPage />
    </ProtectedRoute>
  );
}
