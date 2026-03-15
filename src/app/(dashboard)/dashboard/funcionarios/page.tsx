"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
import { Search, Plus, Loader2, Edit, User, Percent } from "lucide-react";
import toast from "react-hot-toast";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { Can } from "@/components/permissions/can";

interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  defaultCommissionPercent: number | null;
  createdAt: string;
}

function FuncionariosPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    defaultCommissionPercent: "" as string | number,
  });

  useEffect(() => {
    fetchEmployees();
  }, [search, page, statusFilter]);

  async function fetchEmployees() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        page: page.toString(),
        pageSize: "50",
        status: statusFilter,
        role: "VENDEDOR",
      });

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
    setForm({ name: "", defaultCommissionPercent: "" });
    setCreateDialogOpen(true);
  }

  function openEdit(emp: Employee) {
    setSelectedEmployee(emp);
    setForm({
      name: emp.name,
      defaultCommissionPercent: emp.defaultCommissionPercent ?? "",
    });
    setEditDialogOpen(true);
  }

  async function handleCreate() {
    if (!form.name.trim()) {
      toast.error("Informe o nome do funcionário");
      return;
    }

    setSaving(true);
    try {
      // Gera email e senha automáticos — funcionário não precisa de login
      const slug = form.name.trim().toLowerCase().replace(/\s+/g, ".").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const autoEmail = `${slug}.${Date.now()}@funcionario.interno`;
      const autoPassword = `func${Date.now()}`;

      const body: any = {
        name: form.name.trim(),
        email: autoEmail,
        password: autoPassword,
        role: "VENDEDOR",
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
        throw new Error(err?.error?.message || "Erro ao cadastrar funcionário");
      }

      toast.success(`${form.name.trim()} cadastrado com sucesso!`);
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
        name: form.name.trim(),
      };

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Funcionários</h1>
          <p className="text-muted-foreground">
            Vendedores e equipe da ótica
          </p>
        </div>
        <Can permission="users.create">
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Vendedor
          </Button>
        </Can>
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
          title="Nenhum vendedor cadastrado"
          description={search ? `Sem resultados para "${search}"` : "Cadastre seus vendedores para aparecerem no PDV"}
          action={!search && (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Vendedor
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
                          <AvatarFallback className="bg-green-100 text-green-700">
                            {getInitials(emp.name)}
                          </AvatarFallback>
                        </Avatar>
                        <p className="font-medium">{emp.name}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {emp.defaultCommissionPercent ? (
                        <span className="inline-flex items-center gap-1 text-sm font-medium">
                          {emp.defaultCommissionPercent}%
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

      {/* Create Dialog — só nome e comissão */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Vendedor</DialogTitle>
            <DialogDescription>
              Cadastre um vendedor para aparecer no PDV
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nome do vendedor"
                autoFocus
              />
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog — só nome e comissão */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Vendedor</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
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
