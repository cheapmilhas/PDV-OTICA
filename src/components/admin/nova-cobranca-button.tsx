"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface NovaCobrancaButtonProps {
  companyId?: string;
  companies?: { id: string; name: string }[];
  label?: string;
}

type ChargeSource = "implementation" | "extra" | "manual_monthly" | "other";

const SOURCE_OPTIONS: { value: ChargeSource; label: string }[] = [
  { value: "implementation", label: "Implementação" },
  { value: "extra", label: "Extra" },
  { value: "manual_monthly", label: "Mensalidade" },
  { value: "other", label: "Outro" },
];

export function NovaCobrancaButton({ companyId, companies, label }: NovaCobrancaButtonProps) {
  const router = useRouter();
  const showCompanySelect = !companyId && !!companies;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [valor, setValor] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [source, setSource] = useState<ChargeSource>("other");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  function resetForm() {
    setValor("");
    setDescription("");
    setDueDate("");
    setSource("other");
    setSelectedCompanyId("");
  }

  function close() {
    setOpen(false);
    resetForm();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const effectiveCompanyId = companyId ?? selectedCompanyId;
    if (!effectiveCompanyId) {
      setMsg("Selecione uma empresa.");
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: effectiveCompanyId,
          amount: Math.round(parseFloat(valor) * 100),
          description,
          source,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        const emailMsg =
          data.emailStatus === "SENT"
            ? " Email enviado."
            : ` Email não enviado (${data.emailStatus}).`;
        setMsg("Cobrança criada." + emailMsg);
        router.refresh();
        setOpen(false);
        resetForm();
      } else {
        setMsg(data.error || "Erro");
      }
    } catch {
      setMsg("Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setMsg(null);
          setOpen(true);
        }}
        className="text-xs text-indigo-400 hover:text-indigo-300 underline"
      >
        {label ?? "Nova cobrança"}
      </button>
      {msg && !open && <span className="text-xs text-gray-400">{msg}</span>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md space-y-4 rounded-lg border border-gray-700 bg-gray-800 p-6 text-white shadow-xl"
          >
            <h2 className="text-lg font-semibold">Nova cobrança</h2>

            {showCompanySelect && (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Empresa
                  <select
                    aria-label="Empresa"
                    value={selectedCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                  >
                    <option value="">Selecione…</option>
                    {companies!.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Valor (R$)
                <input
                  type="number"
                  step="0.01"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00"
                  required
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                />
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Descrição
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                />
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Vencimento (opcional)
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                />
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Tipo
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value as ChargeSource)}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                >
                  {SOURCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="rounded-md border border-amber-700/50 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
              A cobrança é criada de verdade no Asaas. O modo teste afeta apenas o email.
            </p>

            {msg && <p className="text-xs text-gray-300">{msg}</p>}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={close}
                disabled={loading}
                className="rounded-lg px-4 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? "Criando…" : "Criar cobrança"}
              </button>
            </div>
          </form>
        </div>
      )}
    </span>
  );
}
