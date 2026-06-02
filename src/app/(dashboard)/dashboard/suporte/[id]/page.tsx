"use client";

import { useState, useEffect, useCallback, use } from "react";
import { ArrowLeft, Loader2, Send, Headset, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  statusLabel,
  statusClass,
  priorityLabel,
  priorityClass,
  isTerminalTicketStatus,
  type TicketStatusUI,
} from "@/lib/support-ui";

interface TicketMessage {
  id: string;
  authorType: string;
  authorName: string;
  message: string;
  createdAt: string;
}

interface TicketDetail {
  id: string;
  number: string;
  subject: string;
  priority: string;
  status: string;
  createdAt: string;
  messages: TicketMessage[];
}

function TicketDetailContent({ id }: { id: string }) {
  const { toast } = useToast();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/support/tickets/${id}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      const data = await res.json();
      setTicket(data.ticket);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const isClosed = ticket ? isTerminalTicketStatus(ticket.status as TicketStatusUI) : false;
  const canSend = reply.trim().length > 0 && !sending && !isClosed;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const res = await fetch(`/api/support/tickets/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? err?.error ?? "Não foi possível enviar");
      }
      setReply("");
      await load();
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-3xl">
        <div className="h-8 w-48 rounded bg-muted/50 animate-pulse" />
        <div className="h-64 rounded-lg bg-muted/50 animate-pulse" />
      </div>
    );
  }

  if (notFound || !ticket) {
    return (
      <div className="p-4 md:p-6 max-w-3xl">
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <p className="font-medium">Chamado não encontrado</p>
            <Button asChild variant="outline">
              <Link href="/dashboard/suporte">Voltar para o suporte</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8">
          <Link href="/dashboard/suporte" aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">#{ticket.number}</span>
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${statusClass(ticket.status)}`}
            >
              {statusLabel(ticket.status)}
            </span>
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${priorityClass(ticket.priority)}`}
            >
              {priorityLabel(ticket.priority)}
            </span>
          </div>
          <h1 className="text-lg font-semibold tracking-tight truncate mt-0.5">{ticket.subject}</h1>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          {ticket.messages.map((m) => {
            const isClient = m.authorType === "CLIENT";
            return (
              <div key={m.id} className={`flex ${isClient ? "justify-end" : "justify-start"}`}>
                <div className={`flex gap-2 max-w-[85%] ${isClient ? "flex-row-reverse" : "flex-row"}`}>
                  {!isClient && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Headset className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                  <div
                    className={`rounded-lg px-3 py-2 ${
                      isClient ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs font-medium ${isClient ? "text-primary-foreground/90" : "text-foreground"}`}>
                        {isClient ? "Você" : m.authorName || "Suporte"}
                      </span>
                      <span className={`text-[10px] ${isClient ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {format(new Date(m.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words">{m.message}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {isClosed ? (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>
            Este chamado está {statusLabel(ticket.status).toLowerCase()}. Para um novo assunto,{" "}
            <Link href="/dashboard/suporte/novo" className="text-primary font-medium hover:underline">
              abra outro chamado
            </Link>
            .
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Escreva sua resposta…"
            rows={3}
            maxLength={5000}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend();
            }}
          />
          <div className="flex justify-end">
            <Button onClick={handleSend} disabled={!canSend}>
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TicketDetailContent id={id} />;
}
