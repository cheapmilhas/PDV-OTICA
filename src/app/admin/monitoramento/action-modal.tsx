"use client";

// src/app/admin/monitoramento/action-modal.tsx
//
// Modal de ação gerado a partir do descritor de blueprint (Fase 5, Task 5.4).
// Renderiza inputs conforme os campos descritos (string→texto, number→stepper,
// enum→select), exige "motivo" se requireReason e "digite o nome" se typeToConfirm.
// SEMPRE injeta companyId no input (invariante §7). Submete p/ /api/admin/actions/[id].
// Em falha, mostra error.message + o identificador de log (errorId do corpo e/ou
// x-request-id do header) para rastrear no servidor.
import { useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

export type FieldType = "string" | "number" | "enum";

export interface FieldDescriptor {
  name: string;
  type: FieldType;
  options?: string[];
}

export interface BlueprintDescriptor {
  id: string;
  label: string;
  description: string;
  category: "client" | "system";
  icon: string;
  riskLevel: "low" | "medium" | "high";
  confirm?: { requireReason: boolean; typeToConfirm?: "companyName" };
  allowedRoles: string[];
  fields: FieldDescriptor[];
}

interface ActionModalProps {
  blueprint: BlueprintDescriptor;
  companyId: string;
  companyName: string;
  onClose: () => void;
  onDone?: (message: string) => void;
}

const RISK_META: Record<string, { label: string; cls: string }> = {
  low: { label: "Baixo risco", cls: "bg-green-500/10 text-green-300 border-green-500/30" },
  medium: { label: "Risco médio", cls: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  high: { label: "Alto risco", cls: "bg-red-500/10 text-red-300 border-red-500/30" },
};

export function ActionModal({ blueprint, companyId, companyName, onClose, onDone }: ActionModalProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      blueprint.fields.map((f) => [f.name, f.type === "enum" ? f.options?.[0] ?? "" : ""]),
    ),
  );
  const [reason, setReason] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requireReason = blueprint.confirm?.requireReason ?? false;
  const requireName = blueprint.confirm?.typeToConfirm === "companyName";
  const risk = RISK_META[blueprint.riskLevel];

  const fieldsFilled = blueprint.fields.every((f) => values[f.name]?.toString().trim() !== "");
  const canSubmit =
    fieldsFilled &&
    (!requireReason || reason.trim() !== "") &&
    (!requireName || confirmName.trim() === companyName.trim());

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      // number→Number; demais ficam string. companyId é injetado aqui (invariante).
      const input: Record<string, unknown> = { companyId };
      for (const f of blueprint.fields) {
        input[f.name] = f.type === "number" ? Number(values[f.name]) : values[f.name];
      }

      const res = await fetch(`/api/admin/actions/${blueprint.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          ...(requireReason ? { reason } : {}),
          ...(requireName ? { confirmName } : {}),
        }),
      });
      const requestId = res.headers.get("x-request-id");
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        const ref = json.error?.errorId ?? requestId;
        setError((json.error?.message ?? "Erro ao executar ação") + (ref ? ` (ref: ${ref})` : ""));
        return;
      }
      // Falha "soft": blueprint retorna { ok:false, message } com HTTP 200.
      if (json.data?.ok === false) {
        setError(json.data?.message ?? "Ação não realizada");
        return;
      }
      onDone?.(json.data?.message ?? "Ação executada com sucesso");
      onClose();
    } catch {
      setError("Erro de rede ao executar ação");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-gray-800 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-white">{blueprint.label}</h3>
            <p className="mt-0.5 text-sm text-gray-400">{blueprint.description}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-500 hover:bg-gray-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Empresa: <span className="text-gray-300">{companyName}</span>
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${risk.cls}`}>
              {risk.label}
            </span>
          </div>

          {blueprint.fields.map((f) => (
            <div key={f.name}>
              <label className="mb-1 block text-xs font-medium text-gray-400">{f.name}</label>
              {f.type === "enum" ? (
                <select
                  value={values[f.name]}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                >
                  {f.options?.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type === "number" ? "number" : "text"}
                  value={values[f.name]}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              )}
            </div>
          ))}

          {requireReason && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Motivo (obrigatório)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                placeholder="Descreva o motivo desta ação"
              />
            </div>
          )}

          {requireName && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">
                Digite <span className="font-semibold text-gray-200">{companyName}</span> para confirmar
              </label>
              <input
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                placeholder={companyName}
              />
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-800 px-5 py-4">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit || loading}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${
              blueprint.riskLevel === "high" ? "bg-red-600 hover:bg-red-500" : "bg-indigo-600 hover:bg-indigo-500"
            }`}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
