"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface Company { id: string; name: string; tradeName: string | null; }
interface Admin { id: string; name: string; }

export function NewTicketForm({ companies, admins }: { companies: Company[]; admins: Admin[] }) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [assignedToId, setAssignedToId] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !subject.trim() || !description.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          subject: subject.trim(),
          description: description.trim(),
          priority,
          ...(assignedToId ? { assignedToId } : {}),
        }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/admin/suporte/tickets/${data.ticket.id}`);
      } else {
        alert(data.error || "Erro ao criar ticket");
      }
    } catch {
      alert("Erro ao criar ticket");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1.5">Empresa *</label>
        <select
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          required
          className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Selecione uma empresa...</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.tradeName || c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1.5">Assunto *</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          placeholder="Descreva brevemente o problema..."
          className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1.5">Descrição *</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={5}
          placeholder="Descreva o problema em detalhes..."
          className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">Prioridade</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="LOW">Baixa</option>
            <option value="MEDIUM">Média</option>
            <option value="HIGH">Alta</option>
            <option value="URGENT">Urgente</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">Atribuir para</label>
          <select
            value={assignedToId}
            onChange={(e) => setAssignedToId(e.target.value)}
            className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Sem atribuição</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 text-sm font-medium rounded-lg transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading || !companyId || !subject.trim() || !description.trim()}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Criando..." : "Criar Ticket"}
        </button>
      </div>
    </form>
  );
}
