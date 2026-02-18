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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, Plus, Eye, Mail, Shield, Loader2, Edit, Trash2, Package, AlertTriangle, User, Settings } from "lucide-react";
import toast from "react-hot-toast";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { Can } from "@/components/permissions/can";
import { useCurrentUser } from "@/hooks/useCurrentUser";

interface UserType {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "GERENTE" | "VENDEDOR" | "CAIXA" | "ATENDENTE";
  active: boolean;
  defaultCommissionPercent: number | null;
  createdAt: string;
  updatedAt: string;
}

function FuncionariosPage() {
  const { isAdmin } = useCurrentUser();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [users, setUsers] = useState<UserType[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<UserType & { password?: string }>>({});
  const [createForm, setCreateForm] = useState<Partial<UserType & { password: string }>>({
    password: "",
    active: true,
  });

  // Buscar usuários da API
  useEffect(() => {
    fetchUsers();
  }, [search, page, statusFilter, roleFilter]);

  async function fetchUsers() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        page: page.toString(),
        pageSize: "20",
        status: statusFilter,
      });

      if (roleFilter) {
        params.set("role", roleFilter);
      }

      const res = await fetch(`/api/users?${params}`);
      if (!res.ok) throw new Error("Erro ao buscar usuários");

      const data = await res.json();
      console.log("API Response:", data);
      console.log("data.data type:", typeof data.data, "isArray:", Array.isArray(data.data));
      console.log("data.data value:", data.data);

      const usersArray = Array.isArray(data.data) ? data.data : (data.data ? [data.data] : []);
      console.log("Setting users:", usersArray);
      setUsers(usersArray);
      setPagination(data.pagination);
    } catch (error: any) {
      console.error("Erro ao carregar usuários:", error);
      toast.error("Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  }

  async function handleViewDetails(id: string) {
    setLoadingDetails(true);
    setDetailsDialogOpen(true);
    setIsEditing(false);

    try {
      const res = await fetch(`/api/users/${id}`);
      if (!res.ok) throw new Error("Erro ao buscar detalhes");

      const { data } = await res.json();
      setSelectedUser(data);
      setEditForm(data);
    } catch (error: any) {
      console.error("Erro ao carregar detalhes:", error);
      toast.error("Erro ao carregar detalhes do usuário");
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
    if (selectedUser) {
      setEditForm(selectedUser);
    }
  }

  async function handleSaveEdit() {
    if (!selectedUser) return;

    const allowedFields = [
      'name', 'email', 'password', 'role', 'defaultCommissionPercent', 'active'
    ];

    const updateData: any = {};
    for (const field of allowedFields) {
      if (field in editForm) {
        const value = (editForm as any)[field];
        // Não enviar senha vazia
        if (field === "password" && (!value || value === "")) continue;
        // Converter strings vazias em null para campos opcionais
        updateData[field] = value === "" ? null : value;
      }
    }

    try {
      const res = await fetch(`/api/users/${selectedUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Erro ao atualizar usuário");
      }

      const { data } = await res.json();
      toast.success("Usuário atualizado com sucesso!");
      setSelectedUser(data);
      setEditForm(data);
      setIsEditing(false);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar usuário");
    }
  }

  async function handleToggleStatus(id: string, currentStatus: boolean) {
    if (!confirm(`Tem certeza que deseja ${currentStatus ? "desativar" : "ativar"} este usuário?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${id}`, {
        method: currentStatus ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: currentStatus ? undefined : JSON.stringify({ active: true }),
      });

      if (!res.ok) throw new Error("Erro ao atualizar usuário");

      toast.success(`Usuário ${currentStatus ? "desativado" : "ativado"} com sucesso!`);
      fetchUsers();
      setDetailsDialogOpen(false);
    } catch (error: any) {
      console.error("Erro ao atualizar usuário:", error);
      toast.error(error.message || "Erro ao atualizar usuário");
    }
  }

  async function handlePermanentDelete(id: string) {
    if (!confirm("⚠️ ATENÇÃO: Esta ação é IRREVERSÍVEL!\n\nTem certeza que deseja EXCLUIR PERMANENTEMENTE este usuário do banco de dados?\n\nTodos os dados serão perdidos e não poderão ser recuperados.")) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${id}?permanent=true`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Erro ao excluir usuário");

      toast.success("Usuário excluído permanentemente!");
      fetchUsers();
      setDetailsDialogOpen(false);
    } catch (error: any) {
      console.error("Erro ao excluir usuário:", error);
      toast.error(error.message || "Erro ao excluir usuário");
    }
  }

  async function handleCreateUser() {
    if (!createForm.name || !createForm.email || !createForm.password || !createForm.role) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    try {
      // Limpar dados antes de enviar
      const cleanData: any = {
        name: createForm.name,
        email: createForm.email,
        password: createForm.password,
        role: createForm.role,
        active: createForm.active ?? true,
      };

      // Adicionar comissão apenas se tiver valor
      if (createForm.defaultCommissionPercent !== null &&
          createForm.defaultCommissionPercent !== undefined &&
          createForm.defaultCommissionPercent !== 0) {
        cleanData.defaultCommissionPercent = createForm.defaultCommissionPercent;
      }

      console.log("Enviando dados:", cleanData);
      const res = await fetch(`/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanData),
      });

      console.log("Resposta status:", res.status);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("Erro da API:", errorData);

        // Exibir detalhes de validação se houver
        if (errorData?.error?.details && Array.isArray(errorData.error.details)) {
          const detailMessages = errorData.error.details.map((d: any) => d.message).join(', ');
          throw new Error(detailMessages);
        }

        const errorMessage = errorData?.error?.message || errorData?.message || "Erro ao criar usuário";
        throw new Error(errorMessage);
      }

      const result = await res.json();
      console.log("Usuário criado:", result);

      toast.success("Usuário criado com sucesso!");
      setCreateDialogOpen(false);
      setCreateForm({ password: "", active: true });
      fetchUsers();
    } catch (error: any) {
      console.error("Erro ao criar usuário:", error);
      toast.error(error.message || "Erro ao criar usuário");
    }
  }

  const getInitials = (name: string) => {
    const parts = name.split(" ");
    return `${parts[0][0]}${parts[parts.length - 1]?.[0] || parts[0][1] || ""}`.toUpperCase();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR");
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "ADMIN":
        return "default";
      case "GERENTE":
        return "secondary";
      case "VENDEDOR":
      case "ATENDENTE":
        return "outline";
      case "CAIXA":
        return "outline";
      default:
        return "outline";
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "ADMIN":
        return "Administrador";
      case "GERENTE":
        return "Gerente";
      case "VENDEDOR":
        return "Vendedor";
      case "CAIXA":
        return "Caixa";
      case "ATENDENTE":
        return "Atendente";
      default:
        return role;
    }
  };

  const totalUsers = pagination?.total || 0;
  const activeUsers = Array.isArray(users) ? users.filter(u => u.active).length : 0;

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
        <Can permission="users.create">
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Funcionário
          </Button>
        </Can>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Funcionários
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalUsers}</p>
            <p className="text-xs text-muted-foreground">
              {activeUsers} ativos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Funcionários Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {activeUsers}
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
              {Array.isArray(users) ? users.filter(u => {
                const days = (Date.now() - new Date(u.createdAt).getTime()) / (1000 * 60 * 60 * 24);
                return days <= 30;
              }).length : 0}
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
          <CardTitle>Buscar Funcionários</CardTitle>
          <CardDescription>
            Pesquise por nome ou email
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
            <Select value={roleFilter || "todos"} onValueChange={(value: any) => {
              setRoleFilter(value === "todos" ? "" : value);
              setPage(1);
            }}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Todos os cargos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os cargos</SelectItem>
                <SelectItem value="ADMIN">Administrador</SelectItem>
                <SelectItem value="GERENTE">Gerente</SelectItem>
                <SelectItem value="VENDEDOR">Vendedor</SelectItem>
                <SelectItem value="CAIXA">Caixa</SelectItem>
                <SelectItem value="ATENDENTE">Atendente</SelectItem>
              </SelectContent>
            </Select>
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
      {!loading && Array.isArray(users) && users.length === 0 && (
        <EmptyState
          icon={<User className="h-12 w-12" />}
          title="Nenhum funcionário encontrado"
          description={
            search
              ? `Não encontramos resultados para "${search}"`
              : "Comece adicionando seu primeiro funcionário"
          }
          action={
            !search && (
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Funcionário
              </Button>
            )
          }
        />
      )}

      {/* Funcionários Table */}
      {!loading && Array.isArray(users) && users.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Lista de Funcionários</CardTitle>
            <CardDescription>
              {pagination?.total || 0} funcionários cadastrados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Comissão</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback className="bg-purple-100 text-purple-600">
                            {getInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{user.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Cadastrado em {formatDate(user.createdAt)}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{user.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getRoleBadgeVariant(user.role)} className="flex items-center gap-1 w-fit">
                        <Shield className="h-3 w-3" />
                        {getRoleLabel(user.role)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.defaultCommissionPercent ? (
                        <span className="text-sm">{user.defaultCommissionPercent}%</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={user.active ? "default" : "secondary"}>
                        {user.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.location.href = `/dashboard/funcionarios/${user.id}/permissoes`}
                            title="Gerenciar Permissões"
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetails(user.id)}
                          title="Ver Detalhes"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
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
            <DialogTitle>Detalhes do Funcionário</DialogTitle>
            <DialogDescription>
              Informações completas do funcionário
            </DialogDescription>
          </DialogHeader>

          {loadingDetails ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : selectedUser ? (
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
                    <Label htmlFor="email">Email *</Label>
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
                    <Label htmlFor="password">Nova Senha (opcional)</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Deixe em branco para manter atual"
                      value={editForm.password || ""}
                      onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Cargo *</Label>
                    <Select
                      value={editForm.role}
                      onValueChange={(value) => setEditForm({ ...editForm, role: value as any })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMIN">Administrador</SelectItem>
                        <SelectItem value="GERENTE">Gerente</SelectItem>
                        <SelectItem value="VENDEDOR">Vendedor</SelectItem>
                        <SelectItem value="CAIXA">Caixa</SelectItem>
                        <SelectItem value="ATENDENTE">Atendente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="commission">Comissão Padrão (%)</Label>
                  <Input
                    id="commission"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={editForm.defaultCommissionPercent || ""}
                    onChange={(e) => setEditForm({ ...editForm, defaultCommissionPercent: e.target.value ? parseFloat(e.target.value) : null })}
                  />
                </div>
              </div>
            ) : (
              // Modo de Visualização
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16">
                      <AvatarFallback className="bg-purple-100 text-purple-600 text-xl">
                        {getInitials(selectedUser.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold">{selectedUser.name}</h3>
                      <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                      <Badge variant={selectedUser.active ? "default" : "secondary"} className="mt-2">
                        {selectedUser.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Cargo</p>
                      <Badge variant={getRoleBadgeVariant(selectedUser.role)} className="mt-1">
                        <Shield className="h-3 w-3 mr-1" />
                        {getRoleLabel(selectedUser.role)}
                      </Badge>
                    </div>
                    {selectedUser.defaultCommissionPercent && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Comissão Padrão</p>
                        <p className="text-sm mt-1">{selectedUser.defaultCommissionPercent}%</p>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 text-xs text-muted-foreground">
                    <div>
                      <p className="font-medium">Cadastrado em</p>
                      <p>{formatDate(selectedUser.createdAt)}</p>
                    </div>
                    <div>
                      <p className="font-medium">Última atualização</p>
                      <p>{formatDate(selectedUser.updatedAt)}</p>
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
                {selectedUser && (
                  <>
                    {!selectedUser.active && (
                      <Button
                        variant="destructive"
                        onClick={() => handlePermanentDelete(selectedUser.id)}
                      >
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Excluir Permanentemente
                      </Button>
                    )}
                    <Button
                      variant={selectedUser.active ? "destructive" : "default"}
                      onClick={() => handleToggleStatus(selectedUser.id, selectedUser.active)}
                    >
                      {selectedUser.active ? (
                        <>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Desativar
                        </>
                      ) : (
                        "Ativar"
                      )}
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="outline"
                        onClick={() => window.location.href = `/dashboard/funcionarios/${selectedUser.id}/permissoes`}
                      >
                        <Settings className="h-4 w-4 mr-2" />
                        Permissões
                      </Button>
                    )}
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

      {/* Modal de Criar Funcionário */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo Funcionário</DialogTitle>
            <DialogDescription>
              Cadastre um novo funcionário no sistema. O email será usado como login e você deve definir uma senha de acesso.
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
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-email">Email *</Label>
                <Input
                  id="create-email"
                  type="email"
                  value={createForm.email || ""}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="create-password">Senha * (mínimo 6 caracteres)</Label>
                <Input
                  id="create-password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={createForm.password || ""}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-role">Cargo *</Label>
                <Select
                  value={createForm.role}
                  onValueChange={(value) => setCreateForm({ ...createForm, role: value as any })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cargo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Administrador</SelectItem>
                    <SelectItem value="GERENTE">Gerente</SelectItem>
                    <SelectItem value="VENDEDOR">Vendedor</SelectItem>
                    <SelectItem value="CAIXA">Caixa</SelectItem>
                    <SelectItem value="ATENDENTE">Atendente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-commission">Comissão Padrão (%)</Label>
              <Input
                id="create-commission"
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="0.00"
                value={createForm.defaultCommissionPercent || ""}
                onChange={(e) => setCreateForm({ ...createForm, defaultCommissionPercent: e.target.value ? parseFloat(e.target.value) : null })}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateUser}>
              Criar Funcionário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="users.view">
      <FuncionariosPage />
    </ProtectedRoute>
  );
}
