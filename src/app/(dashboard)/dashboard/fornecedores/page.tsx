"use client";

import { useState, useEffect } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, Plus, Eye, Mail, Phone, MapPin, TrendingUp, Loader2, Edit, Trash2, Package } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";

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

export default function FornecedoresPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Buscar fornecedores da API
  useEffect(() => {
    fetchSuppliers();
  }, [search, page]);

  async function fetchSuppliers() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        page: page.toString(),
        pageSize: "20",
        status: "ativos",
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

    try {
      const res = await fetch(`/api/suppliers/${id}`);
      if (!res.ok) throw new Error("Erro ao buscar detalhes");

      const { data } = await res.json();
      setSelectedSupplier(data);
    } catch (error: any) {
      console.error("Erro ao carregar detalhes:", error);
      toast.error("Erro ao carregar detalhes do fornecedor");
      setDetailsDialogOpen(false);
    } finally {
      setLoadingDetails(false);
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

  const getInitials = (name: string) => {
    const parts = name.split(" ");
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR");
  };

  const totalFornecedores = pagination?.total || 0;
  const fornecedoresAtivos = suppliers.filter(s => s.active).length;

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
        <Button onClick={() => toast.info("Em desenvolvimento")}>
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

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>Buscar Fornecedores</CardTitle>
          <CardDescription>
            Pesquise por nome, CNPJ, email ou telefone
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
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
          ) : null}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDetailsDialogOpen(false)}
            >
              Fechar
            </Button>
            {selectedSupplier && (
              <>
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
                <Button onClick={() => toast.info("Edição em desenvolvimento")}>
                  <Edit className="h-4 w-4 mr-2" />
                  Editar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
