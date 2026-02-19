"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface Company {
  id: string;
  name: string;
  subscriptions: {
    id: string;
    plan: { name: string; priceMonthly: number };
  }[];
}

export function NewInvoiceForm({ companies }: { companies: Company[] }) {
  const [companyId, setCompanyId] = useState("");
  const [customValue, setCustomValue] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [billingType, setBillingType] = useState("PIX");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const selectedCompany = companies.find((c) => c.id === companyId);
  const subscription = selectedCompany?.subscriptions[0];
  const planValue = subscription ? subscription.plan.priceMonthly / 100 : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !subscription) {
      alert("Selecione uma empresa");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/faturas/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionId: subscription.id,
          customValue: customValue ? parseFloat(customValue) * 100 : undefined,
          dueDate: dueDate || undefined,
          billingType,
          description,
        }),
      });

      const data = await res.json();

      if (data.success) {
        router.push(`/admin/faturas/${data.invoice.id}`);
      } else {
        alert(data.error || "Erro ao criar cobrança");
      }
    } catch (error) {
      alert("Erro ao criar cobrança");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Empresa */}
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">Empresa *</label>
        <select
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          required
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white"
        >
          <option value="">Selecione uma empresa...</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name} - {company.subscriptions[0]?.plan.name || "Sem plano"}
            </option>
          ))}
        </select>
      </div>

      {/* Valor */}
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Valor (deixe vazio para usar o valor do plano: R$ {planValue.toFixed(2)})
        </label>
        <input
          type="number"
          step="0.01"
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          placeholder={planValue.toFixed(2)}
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white"
        />
      </div>

      {/* Vencimento */}
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">Vencimento</label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white"
        />
      </div>

      {/* Tipo */}
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">Forma de Pagamento</label>
        <select
          value={billingType}
          onChange={(e) => setBillingType(e.target.value)}
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white"
        >
          <option value="PIX">PIX</option>
          <option value="BOLETO">Boleto</option>
          <option value="CARTAO">Cartão</option>
          <option value="TRANSFERENCIA">Transferência</option>
        </select>
      </div>

      {/* Descrição */}
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">Descrição (opcional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Ex: Mensalidade Março/2026"
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white resize-none"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || !companyId}
        className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Criando...
          </>
        ) : (
          "Criar Cobrança"
        )}
      </button>
    </form>
  );
}
