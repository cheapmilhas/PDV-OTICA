"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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

    if (!content.trim()) {
      toast.error("Digite uma mensagem");
      return;
    }

    setSending(true);

    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, isInternal }),
      });

      if (!res.ok) {
        toast.error("Erro ao enviar mensagem");
        return;
      }

      toast.success("Mensagem enviada!");
      setContent("");
      setIsInternal(false);
      router.refresh();
    } catch (error) {
      toast.error("Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico de Mensagens</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Lista de mensagens */}
        <div className="space-y-4 max-h-[500px] overflow-y-auto">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`p-4 rounded-lg ${
                message.isInternal
                  ? "bg-yellow-50 border border-yellow-200"
                  : "bg-gray-50"
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-medium text-sm">{message.authorName || "Sistema"}</p>
                  <p className="text-xs text-gray-500">
                    {format(message.createdAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
                {message.isInternal && (
                  <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded">
                    Nota Interna
                  </span>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap">{message.message}</p>
            </div>
          ))}

          {messages.length === 0 && (
            <p className="text-center text-gray-500 py-8">Nenhuma mensagem ainda</p>
          )}
        </div>

        {/* Formulário de nova mensagem */}
        <form onSubmit={handleSubmit} className="space-y-3 pt-4 border-t">
          <div>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Digite sua mensagem..."
              rows={4}
              disabled={sending}
            />
          </div>

          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isInternal"
                checked={isInternal}
                onCheckedChange={(checked) => setIsInternal(checked as boolean)}
                disabled={sending}
              />
              <Label htmlFor="isInternal" className="text-sm cursor-pointer">
                Nota interna (não visível para o cliente)
              </Label>
            </div>

            <Button type="submit" disabled={sending}>
              {sending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Enviar Mensagem
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
