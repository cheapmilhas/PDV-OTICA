"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Shield, Users, X, Pencil } from "lucide-react";

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

const ROLE_STYLES: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-900/50 text-purple-400",
  ADMIN: "bg-blue-900/50 text-blue-400",
  SUPPORT: "bg-green-900/50 text-green-400",
  BILLING: "bg-yellow-900/50 text-yellow-400",
};

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
    if (admin.id === currentAdminId) { alert("Você não pode desativar sua própria conta"); return; }

    const action = admin.active ? "desativar" : "reativar";
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} "${admin.name}"?`)) return;

    try {
      if (admin.active) {
        const res = await fetch(`/api/admin/users/${admin.id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || "Erro");
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
          alert(data.error || "Erro");
          return;
        }
      }
      router.refresh();
    } catch {
      alert("Erro ao executar ação");
    }
  }

  return (
    <div className="p-6 text-white">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Usuários Admin</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {initialAdmins.length} usuário{initialAdmins.length !== 1 ? "s" : ""} administrativo{initialAdmins.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!isSuperAdmin && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-900/20 border border-yellow-800 text-yellow-400 text-xs">
              <Shield className="h-3.5 w-3.5" />
              Acesso limitado
            </div>
          )}
          {isSuperAdmin && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Novo Usuário
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {["Usuário", "Email", "Cargo", "Status", "Último Login", "Cadastro", ...(isSuperAdmin ? ["Ações"] : [])].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {initialAdmins.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <Users className="h-8 w-8 text-gray-700 mx-auto mb-2" />
                    <p className="text-gray-600">Nenhum usuário admin</p>
                  </td>
                </tr>
              ) : (
                initialAdmins.map((admin) => (
                  <tr key={admin.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-semibold text-white flex-shrink-0">
                          {admin.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-white">{admin.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-400">{admin.email}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_STYLES[admin.role] ?? "bg-gray-800 text-gray-400"}`}>
                        <Shield className="h-3 w-3" />
                        {ROLE_LABELS[admin.role] ?? admin.role}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${admin.active ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"}`}>
                        {admin.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">
                      {admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString("pt-BR") : "Nunca"}
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">
                      {new Date(admin.createdAt).toLocaleDateString("pt-BR")}
                    </td>
                    {isSuperAdmin && (
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEdit(admin)}
                            className="p-1.5 text-gray-500 hover:text-white transition-colors rounded"
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {admin.id !== currentAdminId && (
                            <button
                              onClick={() => toggleActive(admin)}
                              className={`text-xs px-2 py-1 rounded transition-colors ${admin.active ? "text-red-400 hover:bg-red-900/30" : "text-green-400 hover:bg-green-900/30"}`}
                            >
                              {admin.active ? "Desativar" : "Reativar"}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de criação/edição */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">
                {editingAdmin ? "Editar Admin" : "Novo Usuário Admin"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Nome <span className="text-red-400">*</span></label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-indigo-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Email <span className="text-red-400">*</span></label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-indigo-500 focus:outline-none"
                  required
                  disabled={!!editingAdmin}
                />
              </div>

              {!editingAdmin && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Senha <span className="text-red-400">*</span></label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-indigo-500 focus:outline-none"
                    minLength={6}
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Cargo <span className="text-red-400">*</span></label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-indigo-500 focus:outline-none"
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingAdmin ? "Salvar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
