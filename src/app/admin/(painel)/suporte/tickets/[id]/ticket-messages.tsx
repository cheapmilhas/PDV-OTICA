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
    <div className="rounded-xl border border-border bg-card">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Histórico de Mensagens</h3>
      </div>

      <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
        {messages.length === 0 ? (
          <p className="px-6 py-8 text-center text-muted-foreground text-sm">Nenhuma mensagem ainda</p>
        ) : messages.map((message) => (
          <div
            key={message.id}
            className={`px-6 py-4 ${message.isInternal ? "bg-amber-50 border-l-2 border-amber-300" : ""}`}
          >
            <div className="flex justify-between items-start mb-1.5">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{message.authorName || "Sistema"}</p>
                {message.isInternal && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                    Nota Interna
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {format(new Date(message.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap">{message.message}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="px-6 py-4 border-t border-border space-y-3">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Digite sua mensagem..."
          rows={3}
          disabled={sending}
          className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none disabled:opacity-50"
        />
        <div className="flex justify-between items-center">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground">
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
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Enviando..." : "Enviar"}
          </button>
        </div>
      </form>
    </div>
  );
}
