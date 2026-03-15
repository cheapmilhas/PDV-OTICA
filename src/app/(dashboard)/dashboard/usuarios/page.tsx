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
import { Plus, Shield, Loader2, Edit, Trash2, AlertTriangle, User, Settings, KeyRound, Building2 } from "lucide-react";
import toast from "react-hot-toast";
import { EmptyState } from "@/components/shared/empty-state";
import { Can } from "@/components/permissions/can";
import { usePermissions } from "@/hooks/usePermissions";

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

function UsuariosPage() {
  const { hasPermission } = usePermissions();
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "" as string,
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      // Busca apenas usuários com roles de acesso ao sistema (não VENDEDOR)
      const params = new URLSearchParams({
        pageSize: "100",
        status: "todos",
      });

      const res = await fetch(`/api/users?${params}`);
      if (!res.ok) throw new Error("Erro ao buscar usuários");

      const data = await res.json();
      const arr = Array.isArray(data.data) ? data.data : (data.data ? [data.data] : []);
      // Filtra localmente para mostrar apenas ADMIN, GERENTE, CAIXA, ATENDENTE (quem tem acesso real)
      const systemUsers = arr.filter((u: UserType) =>
        ["ADMIN", "GERENTE", "CAIXA", "ATENDENTE"].includes(u.role)
      );
      setUsers(systemUsers);
    } catch (error: any) {
      toast.error("Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setSelectedUser(null);
    setForm({ name: "", email: "", password: "", role: "" });
    setCreateDialogOpen(true);
  }

  function openEdit(user: UserType) {
    setSelectedUser(user);
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
    });
    setEditDialogOpen(true);
  }

  async function handleCreate() {
    if (!form.name || !form.password || !form.role) {
      toast.error("Preencha nome, senha e cargo");
      return;
    }

    setSaving(true);
    try {
      // Gera email automático se não informado
      const email = form.email.trim() || `${form.name.trim().toLowerCase().replace(/\s+/g, ".").normalize("NFD").replace(/[\u0300-\u036f]/g, "")}.${Date.now()}@sistema.interno`;

      const body: any = {
        name: form.name.trim(),
        email,
        password: form.password,
        role: form.role,
        active: true,
      };

      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || "Erro ao criar usuário");
      }

      toast.success("Usuário criado com sucesso!");
      setCreateDialogOpen(false);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit() {
    if (!selectedUser) return;

    setSaving(true);
    try {
      const body: any = {
        name: form.name.trim(),
        role: form.role,
      };

      if (form.password) {
        body.password = form.password;
      }

      const res = await fetch(`/api/users/${selectedUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || "Erro ao atualizar");
      }

      toast.success("Usuário atualizado!");
      setEditDialogOpen(false);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(user: UserType) {
    const action = user.active ? "desativar" : "ativar";
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} "${user.name}"?`)) return;

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: user.active ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: user.active ? undefined : JSON.stringify({ active: true }),
      });

      if (!res.ok) throw new Error();
      toast.success(`Usuário ${user.active ? "desativado" : "ativado"}!`);
      fetchUsers();
    } catch {
      toast.error(`Erro ao ${action} usuário`);
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
      CAIXA: "Caixa",
      ATENDENTE: "Atendente",
    };
    return labels[role] || role;
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "ADMIN": return "bg-red-100 text-red-700";
      case "GERENTE": return "bg-blue-100 text-blue-700";
      case "CAIXA": return "bg-yellow-100 text-yellow-700";
      case "ATENDENTE": return "bg-purple-100 text-purple-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Usuários do Sistema</h1>
          <p className="text-muted-foreground">
            Gerencie quem tem acesso ao sistema
          </p>
        </div>
        <Can permission="users.create">
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Usuário
          </Button>
        </Can>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty */}
      {!loading && users.length === 0 && (
        <EmptyState
          icon={<User className="h-12 w-12" />}
          title="Nenhum usuário cadastrado"
          description="Cadastre usuários para dar acesso ao sistema"
          action={
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Usuário
            </Button>
          }
        />
      )}

      {/* Table */}
      {!loading && users.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className={getRoleColor(user.role)}>
                            {getInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <p className="font-medium">{user.name}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(user.role)}`}>
                        {getRoleLabel(user.role)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={user.active ? "default" : "secondary"}>
                        {user.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {hasPermission("permissions.manage") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.location.href = `/dashboard/usuarios/${user.id}/permissoes`}
                            title="Permissões"
                          >
                            <Shield className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(user)}
                          title="Editar"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            const newPass = prompt(`Nova senha para ${user.name}:\n(mínimo 6 caracteres)`);
                            if (!newPass) return;
                            if (newPass.length < 6) { toast.error("Senha deve ter pelo menos 6 caracteres"); return; }
                            try {
                              const res = await fetch(`/api/users/${user.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ password: newPass }),
                              });
                              if (!res.ok) throw new Error();
                              toast.success(`Senha de ${user.name} alterada!`);
                            } catch {
                              toast.error("Erro ao alterar senha");
                            }
                          }}
                          title="Alterar Senha"
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        {user.role !== "ADMIN" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleToggleStatus(user)}
                            title={user.active ? "Desativar" : "Ativar"}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Usuário do Sistema</DialogTitle>
            <DialogDescription>
              Crie um acesso para gerenciar o sistema
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nome do usuário"
                autoFocus
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

            <div className="space-y-2">
              <Label>Cargo *</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cargo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Administrador</SelectItem>
                  <SelectItem value="GERENTE">Gerente</SelectItem>
                  <SelectItem value="CAIXA">Caixa</SelectItem>
                  <SelectItem value="ATENDENTE">Atendente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Criar Usuário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
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
              <Label>Nova Senha</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Deixe vazio para manter"
              />
            </div>

            <div className="space-y-2">
              <Label>Cargo *</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Administrador</SelectItem>
                  <SelectItem value="GERENTE">Gerente</SelectItem>
                  <SelectItem value="CAIXA">Caixa</SelectItem>
                  <SelectItem value="ATENDENTE">Atendente</SelectItem>
                </SelectContent>
              </Select>
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
      <UsuariosPage />
    </ProtectedRoute>
  );
}
