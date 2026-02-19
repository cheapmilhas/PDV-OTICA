"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, Plus } from "lucide-react";

interface InvoiceActionsProps {
  invoiceId: string;
  type: string;
  currentNote?: string | null;
}

export function InvoiceActions({ invoiceId, type, currentNote }: InvoiceActionsProps) {
  const [loading, setLoading] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [note, setNote] = useState(currentNote || "");
  const [nfNumber, setNfNumber] = useState("");
  const [nfUrl, setNfUrl] = useState("");
  const [method, setMethod] = useState("whatsapp");
  const router = useRouter();

  const handleAction = async (extraData?: Record<string, any>) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/financeiro/faturas/${invoiceId}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: type, ...extraData }),
      });

      const data = await res.json();

      if (data.success) {
        router.refresh();
      } else {
        alert(data.error || "Erro ao executar ação");
      }
    } catch (error) {
      alert("Erro ao executar ação");
    } finally {
      setLoading(false);
    }
  };

  // Botão de marcar etapa como concluída
  if (type === "mark_sent") {
    return (
      <div className="mt-2 space-y-2">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white"
        >
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Email</option>
          <option value="manual">Entrega manual</option>
        </select>
        <button
          onClick={() => handleAction({ method })}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Marcar como enviado
        </button>
      </div>
    );
  }

  if (type === "mark_paid") {
    return (
      <button
        onClick={() => handleAction()}
        disabled={loading}
        className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Confirmar pagamento
      </button>
    );
  }

  if (type === "mark_nf_generated") {
    return (
      <div className="mt-2 space-y-2">
        <input
          type="text"
          placeholder="Número da NF"
          value={nfNumber}
          onChange={(e) => setNfNumber(e.target.value)}
          className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white w-full"
        />
        <input
          type="url"
          placeholder="URL da NF (opcional)"
          value={nfUrl}
          onChange={(e) => setNfUrl(e.target.value)}
          className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white w-full"
        />
        <button
          onClick={() => handleAction({ nfNumber, nfUrl })}
          disabled={loading || !nfNumber}
          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Registrar NF
        </button>
      </div>
    );
  }

  if (type === "mark_nf_sent") {
    return (
      <button
        onClick={() => handleAction()}
        disabled={loading}
        className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Marcar NF como enviada
      </button>
    );
  }

  if (type === "add_note") {
    if (!showNoteInput) {
      return (
        <button
          onClick={() => setShowNoteInput(true)}
          className="mt-3 flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300"
        >
          <Plus className="w-4 h-4" />
          {currentNote ? "Editar observação" : "Adicionar observação"}
        </button>
      );
    }

    return (
      <div className="mt-3 space-y-2">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Escreva uma observação..."
          rows={3}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white resize-none"
        />
        <div className="flex gap-2">
          <button
            onClick={() => handleAction({ note })}
            disabled={loading}
            className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Salvando..." : "Salvar"}
          </button>
          <button
            onClick={() => setShowNoteInput(false)}
            className="px-3 py-1.5 bg-gray-700 text-white rounded text-sm hover:bg-gray-600"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return null;
}
