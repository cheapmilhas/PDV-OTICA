"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Plus,
  MoreVertical,
  KeyRound,
  Pencil,
  UserX,
  UserCheck,
  Copy,
  Check,
  RefreshCw,
  X,
  Users,
  Shield,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/admin/EmptyState";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import {
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

export interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
  branches: { id: string; name: string }[];
  recoveryEmail?: string | null;
}

interface Branch {
  id: string;
  name: string;
}

interface Meta {
  total: number;
  maxUsers: number;
  planName: string;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  GERENTE: "Gerente",
  VENDEDOR: "Vendedor",
  CAIXA: "Caixa",
  ATENDENTE: "Atendente",
};

// Badge de cargo mapeado por semântica (tokens theme-aware):
// ADMIN = privilégio máximo → primary; GERENTE = info; papéis operacionais
// (VENDEDOR/CAIXA) = success/warning; ATENDENTE = neutro (muted).
const ROLE_STYLES: Record<string, string> = {
  ADMIN: "bg-primary/10 text-primary",
  GERENTE: "bg-info/10 text-info",
  VENDEDOR: "bg-success/10 text-success",
  CAIXA: "bg-warning/10 text-warning",
  ATENDENTE: "bg-muted text-muted-foreground",
};

interface CompanyUsersProps {
  companyId: string;
  branches: Branch[];
}

export function CompanyUsers({ companyId, branches }: CompanyUsersProps) {
  const [users, setUsers] = useState<UserData[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, maxUsers: 999, planName: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modais
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState<{ userId: string; userName: string } | null>(null);
  const [showEditModal, setShowEditModal] = useState<UserData | null>(null);
  const [showResetResult, setShowResetResult] = useState<string | null>(null);
  const [showPermissionsModal, setShowPermissionsModal] = useState<{ userId: string; userName: string; role: string } | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/users`);
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users);
        setMeta(data.meta);
      } else {
        setError(data.error);
      }
    } catch {
      setError("Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    setDropdownOpen(null);
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !currentActive }),
      });
      if (res.ok) {
        fetchUsers();
      } else {
        const data = await res.json();
        toast.error(data.error || "Erro ao atualizar usuário");
      }
    } catch {
      toast.error("Erro ao atualizar usuário");
    }
  };

  // maxUsers === -1 significa ilimitado (mesma convenção do backend/plan-limits).
  const unlimited = meta.maxUsers === -1;
  const limitReached = !unlimited && meta.total >= meta.maxUsers;
  const activeCount = users.filter((u) => u.active).length;
  const maxUsersLabel = unlimited ? "∞" : meta.maxUsers;
  const usagePct = unlimited ? 0 : Math.min((activeCount / meta.maxUsers) * 100, 100);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-6 text-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Usuários ({activeCount}/{maxUsersLabel})
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Plano {meta.planName}
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} disabled={limitReached}>
          <Plus className="w-4 h-4" />
          Novo Usuário
        </Button>
      </div>

      {/* Barra de limite */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">
            {unlimited
              ? `${activeCount} usuários ativos (ilimitado)`
              : `${activeCount} de ${meta.maxUsers} usuários ativos`}
          </span>
          {limitReached && (
            <span className="text-xs text-destructive">Limite atingido!</span>
          )}
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          {/* Barra de uso: limite estourado = destructive, quase-cheio = warning, ok = primary.
              Plano ilimitado: barra sempre "ok" e vazia (não há teto a preencher). */}
          <div
            className={`h-2 rounded-full transition-all ${
              limitReached ? "bg-destructive" : !unlimited && usagePct > 80 ? "bg-warning" : "bg-primary"
            }`}
            style={{ width: `${usagePct}%` }}
          />
        </div>
      </div>

      {/* Tabela de usuários */}
      {users.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={Users}
            message="Nenhum usuário cadastrado"
            action={
              <p className="text-xs text-muted-foreground">
                Clique em &quot;Novo Usuário&quot; para criar o primeiro
              </p>
            }
          />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <ResponsiveTable minWidth={720}>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Filial</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <p className="text-sm font-medium text-foreground">{user.name}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{user.email}</TableCell>
                  <TableCell>
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ROLE_STYLES[user.role] ?? "bg-muted text-muted-foreground"}`}>
                      {ROLE_LABELS[user.role] ?? user.role}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {user.branches.map((b) => b.name).join(", ") || "—"}
                  </TableCell>
                  <TableCell>
                    {/* Status: ativo = success, inativo = destructive */}
                    {user.active ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-success/10 text-success">
                        Ativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-destructive/10 text-destructive">
                        Inativo
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right relative">
                    <button
                      onClick={() => setDropdownOpen(dropdownOpen === user.id ? null : user.id)}
                      aria-label={`Ações de ${user.name}`}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {dropdownOpen === user.id && (
                      <div className="absolute right-5 top-12 z-10 w-48 bg-card border border-border rounded-lg shadow-xl py-1">
                        <button
                          onClick={() => {
                            setDropdownOpen(null);
                            setShowPasswordModal({ userId: user.id, userName: user.name });
                          }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <KeyRound className="w-4 h-4" />
                          Resetar Senha
                        </button>
                        <button
                          onClick={() => {
                            setDropdownOpen(null);
                            setShowEditModal(user);
                          }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Pencil className="w-4 h-4" />
                          Editar Dados
                        </button>
                        <button
                          onClick={() => {
                            setDropdownOpen(null);
                            setShowPermissionsModal({ userId: user.id, userName: user.name, role: user.role });
                          }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Shield className="w-4 h-4" />
                          Gerenciar Permissões
                        </button>
                        <div className="border-t border-border my-1" />
                        {/* Desativar = destructive; Reativar = success */}
                        <button
                          onClick={() => handleToggleActive(user.id, user.active)}
                          className={`w-full flex items-center gap-2 px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            user.active
                              ? "text-destructive hover:bg-destructive/10"
                              : "text-success hover:bg-success/10"
                          }`}
                        >
                          {user.active ? (
                            <>
                              <UserX className="w-4 h-4" />
                              Desativar
                            </>
                          ) : (
                            <>
                              <UserCheck className="w-4 h-4" />
                              Reativar
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ResponsiveTable>
        </div>
      )}

      {/* Modal: Novo Usuário */}
      {showCreateModal && (
        <CreateUserModal
          companyId={companyId}
          branches={branches}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            fetchUsers();
          }}
        />
      )}

      {/* Modal: Resetar Senha */}
      {showPasswordModal && (
        <ResetPasswordModal
          companyId={companyId}
          userId={showPasswordModal.userId}
          userName={showPasswordModal.userName}
          onClose={() => setShowPasswordModal(null)}
          onReset={(pwd) => {
            setShowPasswordModal(null);
            setShowResetResult(pwd);
          }}
        />
      )}

      {/* Modal: Resultado do Reset */}
      {showResetResult && (
        <PasswordResultModal
          password={showResetResult}
          onClose={() => setShowResetResult(null)}
        />
      )}

      {/* Modal: Editar Usuário */}
      {showEditModal && (
        <EditUserModal
          companyId={companyId}
          user={showEditModal}
          branches={branches}
          onClose={() => setShowEditModal(null)}
          onSaved={() => {
            setShowEditModal(null);
            fetchUsers();
          }}
        />
      )}

      {/* Modal: Gerenciar Permissões */}
      {showPermissionsModal && (
        <PermissionsModal
          companyId={companyId}
          userId={showPermissionsModal.userId}
          userName={showPermissionsModal.userName}
          userRole={showPermissionsModal.role}
          onClose={() => setShowPermissionsModal(null)}
          onSaved={() => {
            setShowPermissionsModal(null);
            fetchUsers();
          }}
        />
      )}
    </div>
  );
}

// ─── Modal: Criar Usuário ───────────────────────────────────────

export function CreateUserModal({
  companyId,
  branches,
  onClose,
  onCreated,
}: {
  companyId: string;
  branches: Branch[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("VENDEDOR");
  const [branchId, setBranchId] = useState(branches[0]?.id || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/companies/${companyId}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role, branchId, recoveryEmail }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let pwd = "Otica@";
    for (let i = 0; i < 4; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    setPassword(pwd);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Novo Usuário</h3>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/25 text-destructive px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-muted-foreground mb-1">Nome completo *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">Login (usuário) *</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="ex: matheusr ou email@exemplo.com"
              className="w-full px-4 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:border-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">Nome curto de acesso; não precisa ser e-mail.</p>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">E-mail de recuperação</label>
            <input
              type="email"
              value={recoveryEmail}
              onChange={(e) => setRecoveryEmail(e.target.value)}
              placeholder="email@exemplo.com"
              className="w-full px-4 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:border-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">Para onde enviamos o link se a senha for esquecida.</p>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">Senha *</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="flex-1 px-4 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:border-primary"
                placeholder="Mínimo 8 caracteres"
              />
              <Button type="button" variant="secondary" onClick={generatePassword}>
                <RefreshCw className="w-3.5 h-3.5" />
                Gerar
              </Button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">Cargo *</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-4 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:border-primary"
            >
              <option value="ADMIN">Administrador (ADMIN)</option>
              <option value="GERENTE">Gerente (GERENTE)</option>
              <option value="VENDEDOR">Vendedor (VENDEDOR)</option>
              <option value="CAIXA">Caixa (CAIXA)</option>
              <option value="ATENDENTE">Atendente (ATENDENTE)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">Filial *</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full px-4 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:border-primary"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Criar Usuário
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal: Resetar Senha ───────────────────────────────────────

function ResetPasswordModal({
  companyId,
  userId,
  userName,
  onClose,
  onReset,
}: {
  companyId: string;
  userId: string;
  userName: string;
  onClose: () => void;
  onReset: (pwd: string) => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/companies/${companyId}/users/${userId}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPassword ? { newPassword } : {}),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onReset(data.temporaryPassword);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Resetar Senha</h3>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Resetar a senha de <strong className="text-foreground">{userName}</strong>
          </p>

          {error && (
            <div className="bg-destructive/10 border border-destructive/25 text-destructive px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-muted-foreground mb-1">Nova senha (opcional)</label>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              className="w-full px-4 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:border-primary"
              placeholder="Deixe vazio para gerar automática"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            {/* Reset de senha é ação sensível/atenção → variante warning */}
            <Button
              type="submit"
              disabled={loading}
              className="bg-warning text-warning-foreground shadow-sm hover:bg-warning/90"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Resetar Senha
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal: Resultado do Reset ──────────────────────────────────

function PasswordResultModal({
  password,
  onClose,
}: {
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-4">
          <div className="text-center">
            {/* Sucesso → token success */}
            <div className="w-12 h-12 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6 text-success" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Senha resetada!</h3>
          </div>

          <div className="bg-muted border border-border rounded-lg p-4 flex items-center justify-between">
            <code className="text-lg font-mono text-foreground">{password}</code>
            <button
              onClick={handleCopy}
              aria-label="Copiar senha"
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          {/* Aviso importante → token warning */}
          <p className="text-xs text-warning text-center">
            Envie esta senha ao usuário. Ela não será exibida novamente.
          </p>

          <Button variant="secondary" onClick={onClose} className="w-full">
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Editar Usuário ──────────────────────────────────────

export function EditUserModal({
  companyId,
  user,
  branches,
  onClose,
  onSaved,
}: {
  companyId: string;
  user: UserData;
  branches: Branch[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [recoveryEmail, setRecoveryEmail] = useState(user.recoveryEmail ?? "");
  const [role, setRole] = useState(user.role);
  const [branchId, setBranchId] = useState(user.branches[0]?.id || branches[0]?.id || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/companies/${companyId}/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, role, branchId, recoveryEmail }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Editar Usuário</h3>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/25 text-destructive px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-muted-foreground mb-1">Nome completo</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">Login (usuário)</label>
            <input
              type="text"
              readOnly
              aria-readonly
              value={user.email.endsWith("@login") ? user.email.replace("@login", "") : user.email}
              className="w-full px-4 py-2 bg-muted border border-input rounded-lg text-foreground focus:outline-none"
            />
            {(user.email.endsWith("@login") || user.email.endsWith("@funcionario.interno")) && (
              <p className="text-xs text-muted-foreground mt-1">Não é um e-mail — é o usuário de acesso.</p>
            )}
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">E-mail de recuperação</label>
            <input
              type="email"
              value={recoveryEmail}
              onChange={(e) => setRecoveryEmail(e.target.value)}
              placeholder="email@exemplo.com"
              className="w-full px-4 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:border-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">Para onde enviamos o link se a senha for esquecida.</p>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">Cargo</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-4 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:border-primary"
            >
              <option value="ADMIN">Administrador (ADMIN)</option>
              <option value="GERENTE">Gerente (GERENTE)</option>
              <option value="VENDEDOR">Vendedor (VENDEDOR)</option>
              <option value="CAIXA">Caixa (CAIXA)</option>
              <option value="ATENDENTE">Atendente (ATENDENTE)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">Filial</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full px-4 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:border-primary"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal: Gerenciar Permissões ─────────────────────────────────

interface PermissionItem {
  id: string;
  code: string;
  name: string;
  category: string;
  fromRole: boolean;
  customOverride: boolean | null;
  effective: boolean;
}

interface PermissionsData {
  user: { id: string; name: string; email: string; role: string };
  modules: Record<string, { module: string; permissions: PermissionItem[] }>;
  summary: { total: number; effective: number; customOverrides: number };
}

const MODULE_LABELS: Record<string, string> = {
  sales: "Vendas",
  quotes: "Orçamentos",
  customers: "Clientes",
  products: "Produtos",
  stock: "Estoque",
  financial: "Financeiro",
  accounts_receivable: "Contas a Receber",
  accounts_payable: "Contas a Pagar",
  cash_shift: "Caixa",
  reports: "Relatórios",
  users: "Usuários",
  permissions: "Permissões",
  settings: "Configurações",
  company: "Empresa",
  branch: "Filiais",
  service_orders: "Ordens de Serviço",
  suppliers: "Fornecedores",
  laboratories: "Laboratórios",
  cashback: "Cashback",
  goals: "Metas",
  campaigns: "Campanhas",
  reminders: "Lembretes",
};

function PermissionsModal({
  companyId,
  userId,
  userName,
  userRole,
  onClose,
  onSaved,
}: {
  companyId: string;
  userId: string;
  userName: string;
  userRole: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<PermissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [role, setRole] = useState(userRole);
  const [changes, setChanges] = useState<Map<string, boolean>>(new Map());
  const [roleChanged, setRoleChanged] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const fetchPermissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/users/${userId}/permissions`);
      const json = await res.json();
      if (res.ok) {
        setData(json);
        setRole(json.user.role);
        setChanges(new Map());
        setRoleChanged(false);
      } else {
        setError(json.error);
      }
    } catch {
      setError("Erro ao carregar permissões");
    } finally {
      setLoading(false);
    }
  }, [companyId, userId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const handleTogglePermission = (code: string, currentEffective: boolean) => {
    if (roleChanged) return; // Don't allow individual changes when role changed
    const newChanges = new Map(changes);
    newChanges.set(code, !currentEffective);
    setChanges(newChanges);
  };

  const handleRoleChange = (newRole: string) => {
    setRole(newRole);
    setRoleChanged(newRole !== data?.user.role);
    if (newRole !== data?.user.role) {
      setChanges(new Map()); // Clear individual changes when role changes
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");

    try {
      const body: { role?: string; permissions?: Array<{ code: string; granted: boolean }> } = {};

      if (roleChanged) {
        body.role = role;
      } else if (changes.size > 0) {
        body.permissions = Array.from(changes.entries()).map(([code, granted]) => ({
          code,
          granted,
        }));
      }

      const res = await fetch(`/api/admin/companies/${companyId}/users/${userId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setShowResetConfirm(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/users/${userId}/permissions`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      await fetchPermissions();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const getEffective = (perm: PermissionItem): boolean => {
    if (roleChanged) return perm.fromRole; // Show role defaults when role is being changed
    if (changes.has(perm.code)) return changes.get(perm.code)!;
    return perm.effective;
  };

  const effectiveCount = data
    ? Object.values(data.modules).reduce(
        (acc, mod) => acc + mod.permissions.filter((p) => getEffective(p)).length,
        0
      )
    : 0;

  const hasChanges = roleChanged || changes.size > 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Permissões</h3>
            <p className="text-sm text-muted-foreground">
              {userName} ({ROLE_LABELS[userRole] ?? userRole})
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <>
            {/* Role selector + summary */}
            <div className="px-6 py-4 border-b border-border flex-shrink-0">
              {error && (
                <div className="bg-destructive/10 border border-destructive/25 text-destructive px-4 py-2 rounded-lg text-sm mb-3">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <label className="text-sm text-muted-foreground">Cargo:</label>
                  <select
                    value={role}
                    onChange={(e) => handleRoleChange(e.target.value)}
                    className="px-3 py-1.5 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="ADMIN">Administrador</option>
                    <option value="GERENTE">Gerente</option>
                    <option value="VENDEDOR">Vendedor</option>
                    <option value="CAIXA">Caixa</option>
                    <option value="ATENDENTE">Atendente</option>
                  </select>
                </div>
                <span className="text-xs text-muted-foreground">
                  {effectiveCount} de {data.summary.total} permissões
                </span>
              </div>

              {roleChanged && (
                <p className="text-xs text-warning mt-2">
                  Alterar o cargo vai resetar as permissões customizadas para o padrão do novo cargo.
                </p>
              )}
            </div>

            {/* Permissions list */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {Object.entries(data.modules).map(([moduleKey, moduleData]) => {
                const moduleEffective = moduleData.permissions.filter((p) => getEffective(p)).length;
                return (
                  <div key={moduleKey} className="rounded-lg border border-border overflow-hidden">
                    <div className="px-4 py-2.5 bg-muted flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        {MODULE_LABELS[moduleKey] ?? moduleKey}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {moduleEffective} de {moduleData.permissions.length}
                      </span>
                    </div>
                    <div className="divide-y divide-border">
                      {moduleData.permissions.map((perm) => {
                        const effective = getEffective(perm);
                        const isCustom = perm.customOverride !== null || changes.has(perm.code);
                        return (
                          <label
                            key={perm.code}
                            className={`flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-muted transition-colors ${
                              roleChanged ? "opacity-60 cursor-default" : ""
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={effective}
                              onChange={() => handleTogglePermission(perm.code, effective)}
                              disabled={roleChanged}
                              className="w-4 h-4 rounded border-input bg-background text-primary focus:ring-ring focus:ring-offset-0"
                            />
                            <span className="text-sm text-foreground flex-1">{perm.name}</span>
                            {isCustom && !roleChanged && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-warning/10 text-warning">
                                custom
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-border flex-shrink-0">
              <button
                onClick={() => setShowResetConfirm(true)}
                disabled={saving || data.summary.customOverrides === 0}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                Resetar para padrão do cargo
              </button>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={onClose}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={saving || !hasChanges}>
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Salvar Permissões
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-destructive">{error || "Erro ao carregar"}</div>
        )}
      </div>

      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetar permissões?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as permissões customizadas voltarão ao padrão do cargo. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleReset}
            >
              Resetar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
