"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Network,
  Plus,
  Loader2,
  X,
  Building2,
  Settings,
  Trash2,
  UserPlus,
} from "lucide-react";

interface NetworkData {
  id: string;
  name: string;
  slug: string;
  sharedCatalog: boolean;
  sharedCustomers: boolean;
  sharedPricing: boolean;
  sharedSuppliers: boolean;
  companies: Array<{
    id: string;
    name: string;
    cnpj: string | null;
    isBlocked: boolean;
    createdAt: string;
    _count: { sales: number; products: number; customers: number };
  }>;
  headquarters: { id: string; name: string } | null;
}

interface CompanyNetworkProps {
  companyId: string;
  networkId: string | null;
}

export function CompanyNetwork({ companyId, networkId }: CompanyNetworkProps) {
  const router = useRouter();
  const [network, setNetwork] = useState<NetworkData | null>(null);
  const [loading, setLoading] = useState(!!networkId);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form create
  const [networkName, setNetworkName] = useState("");
  const [allCompanies, setAllCompanies] = useState<Array<{ id: string; name: string; networkId: string | null }>>([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([companyId]);

  const fetchNetwork = useCallback(async () => {
    if (!networkId) return;
    try {
      const res = await fetch(`/api/admin/networks/${networkId}`);
      const data = await res.json();
      if (data.success) setNetwork(data.data);
    } catch (e) {
      console.error("Erro ao buscar rede:", e);
    } finally {
      setLoading(false);
    }
  }, [networkId]);

  useEffect(() => {
    fetchNetwork();
  }, [fetchNetwork]);

  async function loadCompanies() {
    try {
      const res = await fetch("/api/admin/clientes?pageSize=100");
      const data = await res.json();
      setAllCompanies(
        (data.data || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          networkId: c.networkId,
        }))
      );
    } catch {
      // silencioso
    }
  }

  async function handleCreateNetwork() {
    if (!networkName.trim()) return alert("Nome da rede é obrigatório");
    if (selectedCompanyIds.length < 2) return alert("Selecione pelo menos 2 empresas");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/networks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: networkName,
          companyIds: selectedCompanyIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Erro ao criar rede");
        return;
      }
      setShowCreateForm(false);
      router.refresh();
    } catch {
      alert("Erro ao criar rede");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleSharing(field: string, value: boolean) {
    if (!network) return;
    try {
      await fetch(`/api/admin/networks/${network.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      setNetwork({ ...network, [field]: value });
    } catch {
      alert("Erro ao atualizar configuração");
    }
  }

  async function handleRemoveCompany(removeId: string) {
    if (!network) return;
    if (!confirm("Remover esta empresa da rede?")) return;
    try {
      const res = await fetch(`/api/admin/networks/${network.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove-company", companyId: removeId }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error); return; }
      router.refresh();
    } catch {
      alert("Erro ao remover empresa");
    }
  }

  async function handleDeleteNetwork() {
    if (!network) return;
    if (!confirm(`Desfazer a rede "${network.name}"? As empresas serão desvinculadas.`)) return;
    try {
      await fetch(`/api/admin/networks/${network.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      });
      router.refresh();
    } catch {
      alert("Erro ao remover rede");
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
      </div>
    );
  }

  // Sem rede
  if (!network && !networkId) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
          <Network className="h-12 w-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 mb-4">Esta empresa não faz parte de nenhuma rede.</p>
          <button
            onClick={() => { setShowCreateForm(true); loadCompanies(); }}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg"
          >
            <Plus className="inline h-4 w-4 mr-1" />
            Criar Nova Rede
          </button>
        </div>

        {showCreateForm && (
          <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Nova Rede de Lojas</h3>
              <button onClick={() => setShowCreateForm(false)} className="text-gray-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Nome da Rede *</label>
              <input
                value={networkName}
                onChange={(e) => setNetworkName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white"
                placeholder="Ex: Grupo Visão Total"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-2">
                Empresas da Rede (selecione 2+)
              </label>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {allCompanies
                  .filter((c) => !c.networkId || c.id === companyId)
                  .map((c) => (
                    <label key={c.id} className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCompanyIds.includes(c.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCompanyIds([...selectedCompanyIds, c.id]);
                          } else if (c.id !== companyId) {
                            setSelectedCompanyIds(selectedCompanyIds.filter((id) => id !== c.id));
                          }
                        }}
                        disabled={c.id === companyId}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-300">
                        {c.name} {c.id === companyId && "(esta empresa)"}
                      </span>
                    </label>
                  ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreateForm(false)} className="px-3 py-1.5 text-sm text-gray-400">
                Cancelar
              </button>
              <button
                onClick={handleCreateNetwork}
                disabled={saving}
                className="flex items-center gap-1 px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Criar Rede
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Com rede
  return (
    <div className="space-y-5">
      {/* Info da rede */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-white">{network?.name}</h2>
            <p className="text-xs text-gray-500">
              {network?.companies.length} empresas • Matriz: {network?.headquarters?.name || "—"}
            </p>
          </div>
        </div>

        {/* Empresas */}
        <div className="rounded-lg border border-gray-700 overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Empresa</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">CNPJ</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Produtos</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Clientes</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Vendas</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Ações</th>
              </tr>
            </thead>
            <tbody>
              {network?.companies.map((c) => (
                <tr key={c.id} className="border-b border-gray-700/50">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-gray-500" />
                      <span className="text-white font-medium">{c.name}</span>
                      {network.headquarters?.id === c.id && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/50 text-indigo-400">Matriz</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-xs font-mono">{c.cnpj || "—"}</td>
                  <td className="px-4 py-2 text-center text-gray-400">{c._count.products}</td>
                  <td className="px-4 py-2 text-center text-gray-400">{c._count.customers}</td>
                  <td className="px-4 py-2 text-center text-gray-400">{c._count.sales}</td>
                  <td className="px-4 py-2 text-right">
                    {network.headquarters?.id !== c.id && (
                      <button
                        onClick={() => handleRemoveCompany(c.id)}
                        className="p-1 rounded hover:bg-gray-700 text-red-400"
                        title="Remover da rede"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Configurações de compartilhamento */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase">Compartilhamento</h3>
          <ShareToggle
            label="Catálogo de Produtos"
            description="Produtos marcados como compartilhados ficam visíveis para todas as empresas"
            checked={network?.sharedCatalog ?? false}
            onChange={(v) => handleToggleSharing("sharedCatalog", v)}
          />
          <ShareToggle
            label="Base de Clientes"
            description="Clientes de qualquer empresa da rede podem ser atendidos por todas"
            checked={network?.sharedCustomers ?? false}
            onChange={(v) => handleToggleSharing("sharedCustomers", v)}
          />
          <ShareToggle
            label="Fornecedores"
            description="Fornecedores compartilhados entre empresas da rede"
            checked={network?.sharedSuppliers ?? false}
            onChange={(v) => handleToggleSharing("sharedSuppliers", v)}
          />
          <ShareToggle
            label="Preços Unificados"
            description="Todos usam a mesma tabela de preços"
            checked={network?.sharedPricing ?? false}
            onChange={(v) => handleToggleSharing("sharedPricing", v)}
          />
        </div>
      </div>

      {/* Zona de perigo */}
      <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-5">
        <h3 className="text-xs font-semibold text-red-400 uppercase mb-3">Zona de Perigo</h3>
        <button
          onClick={handleDeleteNetwork}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 border border-red-800 rounded-lg hover:bg-red-900/30"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Desfazer Rede
        </button>
      </div>
    </div>
  );
}

function ShareToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 rounded"
      />
      <div>
        <p className="text-sm text-white">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
    </label>
  );
}
