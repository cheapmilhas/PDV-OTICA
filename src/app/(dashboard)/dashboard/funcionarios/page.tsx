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
import { Search, Plus, Loader2, Edit, User, Phone, Percent, Building2 } from "lucide-react";
import toast from "react-hot-toast";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { Can } from "@/components/permissions/can";

interface Employee {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "GERENTE" | "VENDEDOR" | "CAIXA" | "ATENDENTE";
  active: boolean;
  defaultCommissionPercent: number | null;
  createdAt: string;
  branches?: Array<{ branch: { id: string; name: string } }>;
}

function FuncionariosPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "" as string,
    defaultCommissionPercent: "" as string | number,
  });

  useEffect(() => {
    fetchEmployees();
  }, [search, page, statusFilter, roleFilter]);

  async function fetchEmployees() {
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
      if (!res.ok) throw new Error("Erro ao buscar funcionários");

      const data = await res.json();
      const arr = Array.isArray(data.data) ? data.data : (data.data ? [data.data] : []);
      setEmployees(arr);
      setPagination(data.pagination);
    } catch (error: any) {
      toast.error("Erro ao carregar funcionários");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setSelectedEmployee(null);
    setForm({ name: "", email: "", password: "", role: "", defaultCommissionPercent: "" });
    setCreateDialogOpen(true);
  }

  function openEdit(emp: Employee) {
    setSelectedEmployee(emp);
    setForm({
      name: emp.name,
      email: emp.email,
      password: "",
      role: emp.role,
      defaultCommissionPercent: emp.defaultCommissionPercent ?? "",
    });
    setEditDialogOpen(true);
  }

  async function handleCreate() {
    if (!form.name || !form.email || !form.password || !form.role) {
      toast.error("Preencha nome, email, senha e cargo");
      return;
    }

    setSaving(true);
    try {
      const body: any = {
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        active: true,
      };

      if (form.defaultCommissionPercent !== "" && form.defaultCommissionPercent !== null) {
        body.defaultCommissionPercent = Number(form.defaultCommissionPercent);
      }

      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err?.error?.details && Array.isArray(err.error.details)) {
          throw new Error(err.error.details.map((d: any) => d.message).join(", "));
        }
        throw new Error(err?.error?.message || "Erro ao criar funcionário");
      }

      toast.success("Funcionário cadastrado com sucesso!");
      setCreateDialogOpen(false);
      fetchEmployees();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit() {
    if (!selectedEmployee) return;

    setSaving(true);
    try {
      const body: any = {
        name: form.name,
        role: form.role,
      };

      if (form.email !== selectedEmployee.email) {
        body.email = form.email;
      }

      if (form.password) {
        body.password = form.password;
      }

      if (form.defaultCommissionPercent !== "" && form.defaultCommissionPercent !== null) {
        body.defaultCommissionPercent = Number(form.defaultCommissionPercent);
      } else {
        body.defaultCommissionPercent = null;
      }

      const res = await fetch(`/api/users/${selectedEmployee.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || "Erro ao atualizar");
      }

      toast.success("Funcionário atualizado!");
      setEditDialogOpen(false);
      fetchEmployees();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(emp: Employee) {
    const action = emp.active ? "desativar" : "ativar";
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} "${emp.name}"?`)) return;

    try {
      const res = await fetch(`/api/users/${emp.id}`, {
        method: emp.active ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: emp.active ? undefined : JSON.stringify({ active: true }),
      });

      if (!res.ok) throw new Error();
      toast.success(`Funcionário ${emp.active ? "desativado" : "ativado"}!`);
      fetchEmployees();
    } catch {
      toast.error(`Erro ao ${action} funcionário`);
    }
  }

  const getInitials = (name: string) => {
    const parts = name.split(" ");
    return `${parts[0][0]}${parts[parts.length - 1]?.[0] || parts[0][1] || ""}`.toUpperCase();
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      ADMIN: "Administrador",
      GERENTE: "Gerente",
      VENDEDOR: "Vendedor",
      CAIXA: "Caixa",
      ATENDENTE: "Atendente",
    };
    return labels[role] || role;
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "ADMIN": return "bg-red-100 text-red-700";
      case "GERENTE": return "bg-blue-100 text-blue-700";
      case "VENDEDOR": return "bg-green-100 text-green-700";
      case "CAIXA": return "bg-yellow-100 text-yellow-700";
      case "ATENDENTE": return "bg-purple-100 text-purple-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const totalEmployees = pagination?.total || 0;

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
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Funcionário
          </Button>
        </Can>
      </div>

      {/* Summary */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalEmployees}</div>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        {["VENDEDOR", "GERENTE", "CAIXA"].map((role) => {
          const count = employees.filter((e) => e.role === role).length;
          return (
            <Card key={role}>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{count}</div>
                <p className="text-xs text-muted-foreground">{getRoleLabel(role)}s</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter || "todos"} onValueChange={(v) => { setRoleFilter(v === "todos" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-full md:w-[160px]">
            <SelectValue placeholder="Cargo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="VENDEDOR">Vendedor</SelectItem>
            <SelectItem value="GERENTE">Gerente</SelectItem>
            <SelectItem value="CAIXA">Caixa</SelectItem>
            <SelectItem value="ATENDENTE">Atendente</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v: any) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full md:w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ativos">Ativos</SelectItem>
            <SelectItem value="inativos">Inativos</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty */}
      {!loading && employees.length === 0 && (
        <EmptyState
          icon={<User className="h-12 w-12" />}
          title="Nenhum funcionário encontrado"
          description={search ? `Sem resultados para "${search}"` : "Cadastre seu primeiro funcionário"}
          action={!search && (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Funcionário
            </Button>
          )}
        />
      )}

      {/* Table */}
      {!loading && employees.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead className="text-center">Comissão</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className={getRoleColor(emp.role)}>
                            {getInitials(emp.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{emp.name}</p>
                          <p className="text-xs text-muted-foreground">{emp.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(emp.role)}`}>
                        {getRoleLabel(emp.role)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {emp.defaultCommissionPercent ? (
                        <span className="inline-flex items-center gap-1 text-sm font-medium">
                          <Percent className="h-3 w-3" />
                          {emp.defaultCommissionPercent}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={emp.active ? "default" : "secondary"}
                        className="cursor-pointer"
                        onClick={() => handleToggleStatus(emp)}
                      >
                        {emp.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(emp)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {!loading && pagination && pagination.totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={pagination.totalPages}
          onPageChange={setPage}
          showInfo
        />
      )}

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Funcionário</DialogTitle>
            <DialogDescription>
              Cadastre um novo membro da equipe
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nome completo"
              />
            </div>

            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Senha *</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
            </div>

            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>Cargo *</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VENDEDOR">Vendedor</SelectItem>
                    <SelectItem value="GERENTE">Gerente</SelectItem>
                    <SelectItem value="CAIXA">Caixa</SelectItem>
                    <SelectItem value="ATENDENTE">Atendente</SelectItem>
                    <SelectItem value="ADMIN">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Comissão (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={form.defaultCommissionPercent}
                  onChange={(e) => setForm({ ...form, defaultCommissionPercent: e.target.value })}
                  placeholder="Ex: 5"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Funcionário</DialogTitle>
            <DialogDescription>
              Atualize as informações do funcionário
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Nova Senha</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Deixe vazio para manter"
                />
              </div>
            </div>

            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>Cargo *</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VENDEDOR">Vendedor</SelectItem>
                    <SelectItem value="GERENTE">Gerente</SelectItem>
                    <SelectItem value="CAIXA">Caixa</SelectItem>
                    <SelectItem value="ATENDENTE">Atendente</SelectItem>
                    <SelectItem value="ADMIN">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Comissão (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={form.defaultCommissionPercent}
                  onChange={(e) => setForm({ ...form, defaultCommissionPercent: e.target.value })}
                  placeholder="Ex: 5"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
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
