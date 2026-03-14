"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Plus,
  Pencil,
  Power,
  PowerOff,
  Loader2,
  X,
  Store,
  Users,
  ShoppingCart,
  Wrench,
} from "lucide-react";

interface Branch {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
  nfeSeries: number | null;
  active: boolean;
  createdAt: string;
  _count: {
    sales: number;
    serviceOrders: number;
    userBranches: number;
  };
}

interface CompanyBranchesProps {
  companyId: string;
  maxBranches: number;
}

const ESTADOS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

export function CompanyBranches({ companyId, maxBranches }: CompanyBranchesProps) {
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: "",
    code: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    phone: "",
    nfeSeries: "",
  });

  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/branches`);
      const data = await res.json();
      if (data.success) setBranches(data.data);
    } catch (e) {
      console.error("Erro ao buscar filiais:", e);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  function resetForm() {
    setForm({ name: "", code: "", address: "", city: "", state: "", zipCode: "", phone: "", nfeSeries: "" });
    setEditingBranch(null);
    setShowForm(false);
  }

  function openEditForm(branch: Branch) {
    setForm({
      name: branch.name,
      code: branch.code || "",
      address: branch.address || "",
      city: branch.city || "",
      state: branch.state || "",
      zipCode: branch.zipCode || "",
      phone: branch.phone || "",
      nfeSeries: branch.nfeSeries?.toString() || "",
    });
    setEditingBranch(branch);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return alert("Nome é obrigatório");
    setSaving(true);

    try {
      const url = editingBranch
        ? `/api/admin/companies/${companyId}/branches/${editingBranch.id}`
        : `/api/admin/companies/${companyId}/branches`;

      const res = await fetch(url, {
        method: editingBranch ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Erro ao salvar filial");
        return;
      }

      resetForm();
      fetchBranches();
      router.refresh();
    } catch {
      alert("Erro ao salvar filial");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(branch: Branch) {
    const action = branch.active ? "desativar" : "reativar";
    if (!confirm(`${branch.active ? "Desativar" : "Reativar"} a filial "${branch.name}"?`)) return;

    try {
      const res = await fetch(`/api/admin/companies/${companyId}/branches/${branch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !branch.active }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || `Erro ao ${action} filial`);
        return;
      }

      fetchBranches();
      router.refresh();
    } catch {
      alert(`Erro ao ${action} filial`);
    }
  }

  const activeBranches = branches.filter((b) => b.active).length;
  const limitReached = maxBranches !== -1 && activeBranches >= maxBranches;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">
            Filiais ({activeBranches} de {maxBranches === -1 ? "ilimitado" : maxBranches})
          </h2>
          {limitReached && (
            <p className="text-xs text-yellow-400 mt-1">
              Limite do plano atingido. Faça upgrade para adicionar mais filiais.
            </p>
          )}
        </div>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            disabled={limitReached}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar Filial
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">
              {editingBranch ? `Editar: ${editingBranch.name}` : "Nova Filial"}
            </h3>
            <button onClick={resetForm} className="p-1 rounded hover:bg-gray-700 text-gray-400">
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Nome da Filial *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Ex: Filial Eusébio"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Código (interno)</label>
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Ex: 002"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Telefone</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="(85) 3456-7890"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Série NF-e</label>
                <input
                  value={form.nfeSeries}
                  onChange={(e) => setForm({ ...form, nfeSeries: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="1"
                  type="number"
                />
              </div>
            </div>
            <div className="border-t border-gray-700 pt-4">
              <p className="text-xs text-gray-500 mb-3">Endereço</p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">CEP</label>
                  <input
                    value={form.zipCode}
                    onChange={(e) => setForm({ ...form, zipCode: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                    placeholder="60000-000"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Endereço</label>
                  <input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                    placeholder="Rua..."
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Cidade</label>
                  <input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                    placeholder="Fortaleza"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Estado</label>
                  <select
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Selecione...</option>
                    {ESTADOS.map((uf) => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {editingBranch ? "Salvar Alterações" : "Criar Filial"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Branches List */}
      {branches.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-12 text-center">
          <Store className="h-12 w-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500">Nenhuma filial cadastrada</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Filial</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Código</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Cidade</th>
                <th className="px-5 py-3 text-center text-xs font-medium text-gray-500">Usuários</th>
                <th className="px-5 py-3 text-center text-xs font-medium text-gray-500">Vendas</th>
                <th className="px-5 py-3 text-center text-xs font-medium text-gray-500">OS</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-500">Ações</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((branch) => (
                <tr
                  key={branch.id}
                  className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${!branch.active ? "opacity-50" : ""}`}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-gray-500 flex-shrink-0" />
                      <span className="font-medium text-white">{branch.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-400 font-mono text-xs">
                    {branch.code || "—"}
                  </td>
                  <td className="px-5 py-3 text-gray-400">
                    {branch.city ? `${branch.city}/${branch.state}` : "—"}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-gray-400">
                      <Users className="h-3 w-3" />
                      {branch._count.userBranches}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-gray-400">
                      <ShoppingCart className="h-3 w-3" />
                      {branch._count.sales}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-gray-400">
                      <Wrench className="h-3 w-3" />
                      {branch._count.serviceOrders}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        branch.active
                          ? "bg-green-900/50 text-green-400"
                          : "bg-red-900/50 text-red-400"
                      }`}
                    >
                      {branch.active ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEditForm(branch)}
                        className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => toggleActive(branch)}
                        className={`p-1.5 rounded hover:bg-gray-700 transition-colors ${
                          branch.active
                            ? "text-yellow-400 hover:text-yellow-300"
                            : "text-green-400 hover:text-green-300"
                        }`}
                        title={branch.active ? "Desativar" : "Reativar"}
                      >
                        {branch.active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
