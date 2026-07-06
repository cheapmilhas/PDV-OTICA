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
  const [removingCompanyId, setRemovingCompanyId] = useState<string | null>(null);
  const [showDeleteNetwork, setShowDeleteNetwork] = useState(false);

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
    if (!networkName.trim()) {
      toast.error("Nome da rede é obrigatório");
      return;
    }
    if (selectedCompanyIds.length < 2) {
      toast.error("Selecione pelo menos 2 empresas");
      return;
    }
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
        toast.error(data.error || "Erro ao criar rede");
        return;
      }
      setShowCreateForm(false);
      router.refresh();
    } catch {
      toast.error("Erro ao criar rede");
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
      toast.error("Erro ao atualizar configuração");
    }
  }

  async function handleRemoveCompany(removeId: string) {
    if (!network) return;
    try {
      const res = await fetch(`/api/admin/networks/${network.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove-company", companyId: removeId }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      router.refresh();
    } catch {
      toast.error("Erro ao remover empresa");
    } finally {
      setRemovingCompanyId(null);
    }
  }

  async function handleDeleteNetwork() {
    if (!network) return;
    try {
      await fetch(`/api/admin/networks/${network.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      });
      router.refresh();
    } catch {
      toast.error("Erro ao remover rede");
    } finally {
      setShowDeleteNetwork(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Sem rede
  if (!network && !networkId) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Network className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">Esta empresa não faz parte de nenhuma rede.</p>
          <button
            onClick={() => { setShowCreateForm(true); loadCompanies(); }}
            className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg"
          >
            <Plus className="inline h-4 w-4 mr-1" />
            Criar Nova Rede
          </button>
        </div>

        {showCreateForm && (
          <div className="rounded-xl border border-border bg-muted p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Nova Rede de Lojas</h3>
              <button onClick={() => setShowCreateForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Nome da Rede *</label>
              <input
                value={networkName}
                onChange={(e) => setNetworkName(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground"
                placeholder="Ex: Grupo Visão Total"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-2">
                Empresas da Rede (selecione 2+)
              </label>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {allCompanies
                  .filter((c) => !c.networkId || c.id === companyId)
                  .map((c) => (
                    <label key={c.id} className="flex items-center gap-2 px-3 py-2 rounded hover:bg-muted cursor-pointer">
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
                      <span className="text-sm text-foreground">
                        {c.name} {c.id === companyId && "(esta empresa)"}
                      </span>
                    </label>
                  ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreateForm(false)} className="px-3 py-1.5 text-sm text-muted-foreground">
                Cancelar
              </button>
              <button
                onClick={handleCreateNetwork}
                disabled={saving}
                className="flex items-center gap-1 px-4 py-1.5 text-sm bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg disabled:opacity-50"
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
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{network?.name}</h2>
            <p className="text-xs text-muted-foreground">
              {network?.companies.length} empresas • Matriz: {network?.headquarters?.name || "—"}
            </p>
          </div>
        </div>

        {/* Empresas */}
        <div className="rounded-lg border border-border overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Empresa</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">CNPJ</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Produtos</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Clientes</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Vendas</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {network?.companies.map((c) => (
                <tr key={c.id} className="border-b border-border">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-foreground font-medium">{c.name}</span>
                      {network.headquarters?.id === c.id && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">Matriz</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground text-xs font-mono">{c.cnpj || "—"}</td>
                  <td className="px-4 py-2 text-center text-muted-foreground">{c._count.products}</td>
                  <td className="px-4 py-2 text-center text-muted-foreground">{c._count.customers}</td>
                  <td className="px-4 py-2 text-center text-muted-foreground">{c._count.sales}</td>
                  <td className="px-4 py-2 text-right">
                    {network.headquarters?.id !== c.id && (
                      <button
                        onClick={() => setRemovingCompanyId(c.id)}
                        className="p-1 rounded hover:bg-muted text-rose-600"
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
          <h3 className="text-xs font-semibold text-muted-foreground uppercase">Compartilhamento</h3>
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
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-5">
        <h3 className="text-xs font-semibold text-rose-600 uppercase mb-3">Zona de Perigo</h3>
        <button
          onClick={() => setShowDeleteNetwork(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-rose-700 border border-rose-200 rounded-lg hover:bg-rose-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Desfazer Rede
        </button>
      </div>

      <AlertDialog open={removingCompanyId !== null} onOpenChange={(o) => !o && setRemovingCompanyId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover empresa da rede?</AlertDialogTitle>
            <AlertDialogDescription>
              A empresa será desvinculada desta rede e deixará de compartilhar dados com as demais.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (removingCompanyId) handleRemoveCompany(removingCompanyId);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteNetwork} onOpenChange={setShowDeleteNetwork}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer a rede &quot;{network?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as empresas serão desvinculadas. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteNetwork}
            >
              Desfazer Rede
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
        <p className="text-sm text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </label>
  );
}
