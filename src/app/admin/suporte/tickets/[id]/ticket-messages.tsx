"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function TicketMessages({ ticketId, messages }: { ticketId: string; messages: any[] }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) { toast.error("Digite uma mensagem"); return; }
    setSending(true);
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, isInternal }),
      });
      if (!res.ok) { toast.error("Erro ao enviar mensagem"); return; }
      toast.success("Mensagem enviada!");
      setContent("");
      setIsInternal(false);
      router.refresh();
    } catch {
      toast.error("Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900">
      <div className="px-6 py-4 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-white">Histórico de Mensagens</h3>
      </div>

      <div className="divide-y divide-gray-800/50 max-h-[500px] overflow-y-auto">
        {messages.length === 0 ? (
          <p className="px-6 py-8 text-center text-gray-600 text-sm">Nenhuma mensagem ainda</p>
        ) : messages.map((message) => (
          <div
            key={message.id}
            className={`px-6 py-4 ${message.isInternal ? "bg-yellow-900/10 border-l-2 border-yellow-700" : ""}`}
          >
            <div className="flex justify-between items-start mb-1.5">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-white">{message.authorName || "Sistema"}</p>
                {message.isInternal && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/40 text-yellow-400 border border-yellow-800">
                    Nota Interna
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">
                {format(new Date(message.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
            <p className="text-sm text-gray-300 whitespace-pre-wrap">{message.message}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="px-6 py-4 border-t border-gray-800 space-y-3">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Digite sua mensagem..."
          rows={3}
          disabled={sending}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none disabled:opacity-50"
        />
        <div className="flex justify-between items-center">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-400 hover:text-white">
            <input
              type="checkbox"
              checked={isInternal}
              onChange={(e) => setIsInternal(e.target.checked)}
              disabled={sending}
              className="rounded"
            />
            Nota interna (não visível para o cliente)
          </label>
          <button
            type="submit"
            disabled={sending}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Enviando..." : "Enviar"}
          </button>
        </div>
      </form>
    </div>
  );
}
