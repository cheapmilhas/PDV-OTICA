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
  ADMIN: "bg-purple-900/50 text-purple-400",
  GERENTE: "bg-blue-900/50 text-blue-400",
  VENDEDOR: "bg-green-900/50 text-green-400",
  CAIXA: "bg-yellow-900/50 text-yellow-400",
  ATENDENTE: "bg-gray-800 text-gray-400",
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
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-800 bg-red-900/20 p-6 text-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">
            Usuários ({activeCount}/{meta.maxUsers})
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Plano {meta.planName}
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          disabled={limitReached}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          <Plus className="w-4 h-4" />
          Novo Usuário
        </button>
      </div>

      {/* Barra de limite */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500">
            {activeCount} de {meta.maxUsers} usuários ativos
          </span>
          {limitReached && (
            <span className="text-xs text-red-400">Limite atingido!</span>
          )}
        </div>
        <div className="w-full bg-gray-800 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              limitReached ? "bg-red-500" : activeCount / meta.maxUsers > 0.8 ? "bg-yellow-500" : "bg-indigo-500"
            }`}
            style={{ width: `${Math.min((activeCount / meta.maxUsers) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Tabela de usuários */}
      {users.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-12 text-center">
          <Users className="h-12 w-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500">Nenhum usuário cadastrado</p>
          <p className="text-xs text-gray-600 mt-1">Clique em "Novo Usuário" para criar o primeiro</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Nome</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Email</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Cargo</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Filial</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-gray-500">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium text-white">{user.name}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-sm">{user.email}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ROLE_STYLES[user.role] ?? "bg-gray-800 text-gray-400"}`}>
                        {ROLE_LABELS[user.role] ?? user.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">
                      {user.branches.map((b) => b.name).join(", ") || "—"}
                    </td>
                    <td className="px-5 py-3">
                      {user.active ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-900/50 text-green-400">
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-900/50 text-red-400">
                          Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right relative">
                      <button
                        onClick={() => setDropdownOpen(dropdownOpen === user.id ? null : user.id)}
                        className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {dropdownOpen === user.id && (
                        <div className="absolute right-5 top-12 z-10 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1">
                          <button
                            onClick={() => {
                              setDropdownOpen(null);
                              setShowPasswordModal({ userId: user.id, userName: user.name });
                            }}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                          >
                            <KeyRound className="w-4 h-4" />
                            Resetar Senha
                          </button>
                          <button
                            onClick={() => {
                              setDropdownOpen(null);
                              setShowEditModal(user);
                            }}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                          >
                            <Pencil className="w-4 h-4" />
                            Editar Dados
                          </button>
                          <div className="border-t border-gray-700 my-1" />
                          <button
                            onClick={() => handleToggleActive(user.id, user.active)}
                            className={`w-full flex items-center gap-2 px-4 py-2 text-sm ${
                              user.active
                                ? "text-red-400 hover:bg-red-900/30"
                                : "text-green-400 hover:bg-green-900/30"
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
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-white">Novo Usuário</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Nome completo *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Email (login) *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Senha *</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                placeholder="Mínimo 8 caracteres"
              />
              <button
                type="button"
                onClick={generatePassword}
                className="flex items-center gap-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-300 hover:bg-gray-600 hover:text-white transition-colors text-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Gerar
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Cargo *</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="ADMIN">Administrador (ADMIN)</option>
              <option value="GERENTE">Gerente (GERENTE)</option>
              <option value="VENDEDOR">Vendedor (VENDEDOR)</option>
              <option value="CAIXA">Caixa (CAIXA)</option>
              <option value="ATENDENTE">Atendente (ATENDENTE)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Filial *</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
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
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 text-sm"
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
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-white">Resetar Senha</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-gray-400">
            Resetar a senha de <strong className="text-white">{userName}</strong>
          </p>

          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Nova senha (opcional)</label>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              placeholder="Deixe vazio para gerar automática"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
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
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-4">
          <div className="text-center">
            <div className="w-12 h-12 bg-green-900/50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6 text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Senha resetada!</h3>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-center justify-between">
            <code className="text-lg font-mono text-white">{password}</code>
            <button
              onClick={handleCopy}
              className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <p className="text-xs text-yellow-400 text-center">
            Envie esta senha ao usuário. Ela não será exibida novamente.
          </p>

          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
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
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-white">Editar Usuário</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Nome completo</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Cargo</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="ADMIN">Administrador (ADMIN)</option>
              <option value="GERENTE">Gerente (GERENTE)</option>
              <option value="VENDEDOR">Vendedor (VENDEDOR)</option>
              <option value="CAIXA">Caixa (CAIXA)</option>
              <option value="ATENDENTE">Atendente (ATENDENTE)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Filial</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
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
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 text-sm"
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
