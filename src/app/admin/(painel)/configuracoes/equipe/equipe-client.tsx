"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Shield, Users, X, Pencil } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/admin/EmptyState";
import { Button } from "@/components/ui/button";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  SUPPORT: "Suporte",
  BILLING: "Financeiro",
};

// Tom semântico via token (theme-aware), não cor hardcoded.
// SUPER_ADMIN=primary (topo), ADMIN=info, SUPPORT=success, BILLING=warning; fallback neutro.
const ROLE_STYLES: Record<string, string> = {
  SUPER_ADMIN: "bg-primary/10 text-primary border-primary/20",
  ADMIN: "bg-info/10 text-info border-info/20",
  SUPPORT: "bg-success/10 text-success border-success/20",
  BILLING: "bg-warning/10 text-warning border-warning/20",
};

const ROLE_FALLBACK = "bg-muted text-muted-foreground border-border";

const ROLES = ["SUPER_ADMIN", "ADMIN", "SUPPORT", "BILLING"] as const;

interface Props {
  initialAdmins: AdminUser[];
  currentAdminRole: string;
  currentAdminId: string;
}

export function EquipeClient({ initialAdmins, currentAdminRole, currentAdminId }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "SUPPORT" as string });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [togglingAdmin, setTogglingAdmin] = useState<AdminUser | null>(null);
  const router = useRouter();

  const isSuperAdmin = currentAdminRole === "SUPER_ADMIN";

  function openCreate() {
    setEditingAdmin(null);
    setForm({ name: "", email: "", password: "", role: "SUPPORT" });
    setError("");
    setShowModal(true);
  }

  function openEdit(admin: AdminUser) {
    setEditingAdmin(admin);
    setForm({ name: admin.name, email: admin.email, password: "", role: admin.role });
    setError("");
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (editingAdmin) {
        // Editar
        const payload: Record<string, string | boolean> = { name: form.name, role: form.role };
        const res = await fetch(`/api/admin/users/${editingAdmin.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Erro ao atualizar"); return; }
      } else {
        // Criar
        if (!form.password) { setError("Senha é obrigatória"); return; }
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Erro ao criar"); return; }
      }

      setShowModal(false);
      router.refresh();
    } catch {
      setError("Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(admin: AdminUser) {
    try {
      if (admin.active) {
        const res = await fetch(`/api/admin/users/${admin.id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json();
          toast.error(data.error || "Erro");
          return;
        }
      } else {
        const res = await fetch(`/api/admin/users/${admin.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: true }),
        });
        if (!res.ok) {
          const data = await res.json();
          toast.error(data.error || "Erro");
          return;
        }
      }
      router.refresh();
    } catch {
      toast.error("Erro ao executar ação");
    } finally {
      setTogglingAdmin(null);
    }
  }

  return (
    <div className="p-6 text-foreground">
      <PageHeader
        title="Usuários Admin"
        subtitle={`${initialAdmins.length} usuário${initialAdmins.length !== 1 ? "s" : ""} administrativo${initialAdmins.length !== 1 ? "s" : ""}`}
        actions={
          <div className="flex items-center gap-3">
            {!isSuperAdmin && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-warning/10 border border-warning/25 text-warning text-xs font-medium">
                <Shield className="h-3.5 w-3.5" />
                Acesso limitado
              </div>
            )}
            {isSuperAdmin && (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Novo Usuário
              </Button>
            )}
          </div>
        }
      />

      {initialAdmins.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState icon={Users} message="Nenhum usuário admin" />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <ResponsiveTable minWidth={980}>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Último Login</TableHead>
                <TableHead>Cadastro</TableHead>
                {isSuperAdmin && <TableHead>Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialAdmins.map((admin) => (
                <TableRow key={admin.id}>
                  {/* Usuário */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-sm font-semibold text-primary-foreground flex-shrink-0">
                        {admin.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-foreground">{admin.name}</span>
                    </div>
                  </TableCell>

                  {/* Email */}
                  <TableCell className="text-muted-foreground">{admin.email}</TableCell>

                  {/* Cargo */}
                  <TableCell>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_STYLES[admin.role] ?? ROLE_FALLBACK}`}>
                      <Shield className="h-3 w-3" />
                      {ROLE_LABELS[admin.role] ?? admin.role}
                    </span>
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${admin.active ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                      {admin.active ? "Ativo" : "Inativo"}
                    </span>
                  </TableCell>

                  {/* Último Login */}
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString("pt-BR") : "Nunca"}
                  </TableCell>

                  {/* Cadastro */}
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(admin.createdAt).toLocaleDateString("pt-BR")}
                  </TableCell>

                  {/* Ações */}
                  {isSuperAdmin && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(admin)}
                          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          title="Editar"
                          aria-label={`Editar ${admin.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {admin.id !== currentAdminId && (
                          <button
                            onClick={() => setTogglingAdmin(admin)}
                            aria-label={`${admin.active ? "Desativar" : "Reativar"} ${admin.name}`}
                            className={`text-xs px-2 py-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${admin.active ? "text-destructive hover:bg-destructive/10" : "text-success hover:bg-success/10"}`}
                          >
                            {admin.active ? "Desativar" : "Reativar"}
                          </button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </ResponsiveTable>
        </div>
      )}

      {/* Modal de criação/edição */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-foreground">
                {editingAdmin ? "Editar Admin" : "Novo Usuário Admin"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                aria-label="Fechar"
                className="text-muted-foreground hover:text-foreground rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/25 rounded-lg text-destructive text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Nome <span className="text-destructive">*</span></label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:border-primary focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Email <span className="text-destructive">*</span></label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:border-primary focus:outline-none"
                  required
                  disabled={!!editingAdmin}
                />
              </div>

              {!editingAdmin && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Senha <span className="text-destructive">*</span></label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:border-primary focus:outline-none"
                    minLength={6}
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Cargo <span className="text-destructive">*</span></label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:border-primary focus:outline-none"
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowModal(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingAdmin ? "Salvar" : "Criar"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AlertDialog open={togglingAdmin !== null} onOpenChange={(o) => !o && setTogglingAdmin(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {togglingAdmin?.active ? "Desativar usuário?" : "Reativar usuário?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {togglingAdmin?.active
                ? `"${togglingAdmin?.name}" perderá o acesso administrativo até ser reativado.`
                : `"${togglingAdmin?.name}" voltará a ter acesso administrativo.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={
                togglingAdmin?.active
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
              onClick={() => {
                if (togglingAdmin) toggleActive(togglingAdmin);
              }}
            >
              {togglingAdmin?.active ? "Desativar" : "Reativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
