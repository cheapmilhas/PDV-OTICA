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

interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
  branches: { id: string; name: string }[];
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

const ROLE_STYLES: Record<string, string> = {
  ADMIN: "bg-purple-100 text-purple-700",
  GERENTE: "bg-blue-100 text-blue-700",
  VENDEDOR: "bg-emerald-100 text-emerald-700",
  CAIXA: "bg-amber-100 text-amber-700",
  ATENDENTE: "bg-zinc-100 text-zinc-700",
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
        alert(data.error || "Erro ao atualizar usuário");
      }
    } catch {
      alert("Erro ao atualizar usuário");
    }
  };

  const limitReached = meta.total >= meta.maxUsers;
  const activeCount = users.filter((u) => u.active).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
        <p className="text-rose-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Usuários ({activeCount}/{meta.maxUsers})
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Plano {meta.planName}
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          disabled={limitReached}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          <Plus className="w-4 h-4" />
          Novo Usuário
        </button>
      </div>

      {/* Barra de limite */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">
            {activeCount} de {meta.maxUsers} usuários ativos
          </span>
          {limitReached && (
            <span className="text-xs text-rose-600">Limite atingido!</span>
          )}
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              limitReached ? "bg-rose-500" : activeCount / meta.maxUsers > 0.8 ? "bg-amber-500" : "bg-primary"
            }`}
            style={{ width: `${Math.min((activeCount / meta.maxUsers) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Tabela de usuários */}
      {users.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhum usuário cadastrado</p>
          <p className="text-xs text-muted-foreground mt-1">Clique em "Novo Usuário" para criar o primeiro</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Nome</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Email</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Cargo</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Filial</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-border hover:bg-muted transition-colors">
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium text-foreground">{user.name}</p>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground text-sm">{user.email}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ROLE_STYLES[user.role] ?? "bg-zinc-100 text-zinc-700"}`}>
                        {ROLE_LABELS[user.role] ?? user.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">
                      {user.branches.map((b) => b.name).join(", ") || "—"}
                    </td>
                    <td className="px-5 py-3">
                      {user.active ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-700">
                          Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right relative">
                      <button
                        onClick={() => setDropdownOpen(dropdownOpen === user.id ? null : user.id)}
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
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
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted hover:text-foreground"
                          >
                            <KeyRound className="w-4 h-4" />
                            Resetar Senha
                          </button>
                          <button
                            onClick={() => {
                              setDropdownOpen(null);
                              setShowEditModal(user);
                            }}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Pencil className="w-4 h-4" />
                            Editar Dados
                          </button>
                          <button
                            onClick={() => {
                              setDropdownOpen(null);
                              setShowPermissionsModal({ userId: user.id, userName: user.name, role: user.role });
                            }}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Shield className="w-4 h-4" />
                            Gerenciar Permissões
                          </button>
                          <div className="border-t border-border my-1" />
                          <button
                            onClick={() => handleToggleActive(user.id, user.active)}
                            className={`w-full flex items-center gap-2 px-4 py-2 text-sm ${
                              user.active
                                ? "text-rose-600 hover:bg-rose-50"
                                : "text-emerald-600 hover:bg-emerald-50"
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

function CreateUserModal({
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
        body: JSON.stringify({ name, email, password, role, branchId }),
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
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2 rounded-lg text-sm">
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
            <label className="block text-sm text-muted-foreground mb-1">Email (login) *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:border-primary"
            />
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
              <button
                type="button"
                onClick={generatePassword}
                className="flex items-center gap-1 px-3 py-2 bg-muted border border-border rounded-lg text-foreground hover:bg-muted hover:text-foreground transition-colors text-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Gerar
              </button>
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
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted transition-colors text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 text-sm"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Criar Usuário
            </button>
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
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Resetar a senha de <strong className="text-foreground">{userName}</strong>
          </p>

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2 rounded-lg text-sm">
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
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted transition-colors text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 text-sm"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Resetar Senha
            </button>
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
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6 text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Senha resetada!</h3>
          </div>

          <div className="bg-muted border border-border rounded-lg p-4 flex items-center justify-between">
            <code className="text-lg font-mono text-foreground">{password}</code>
            <button
              onClick={handleCopy}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <p className="text-xs text-amber-600 text-center">
            Envie esta senha ao usuário. Ela não será exibida novamente.
          </p>

          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted transition-colors text-sm"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Editar Usuário ──────────────────────────────────────

function EditUserModal({
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
  const [email, setEmail] = useState(user.email);
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
        body: JSON.stringify({ name, email, role, branchId }),
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
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2 rounded-lg text-sm">
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
            <label className="block text-sm text-muted-foreground mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:border-primary"
            />
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
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted transition-colors text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 text-sm"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Salvar
            </button>
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
    if (!confirm("Resetar todas as permissões customizadas para o padrão do cargo?")) return;
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
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
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
                <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2 rounded-lg text-sm mb-3">
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
                <p className="text-xs text-amber-600 mt-2">
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
                              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
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
                onClick={handleReset}
                disabled={saving || data.summary.customOverrides === 0}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Resetar para padrão do cargo
              </button>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted transition-colors text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !hasChanges}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 text-sm"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Salvar Permissões
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-rose-600">{error || "Erro ao carregar"}</div>
        )}
      </div>
    </div>
  );
}
