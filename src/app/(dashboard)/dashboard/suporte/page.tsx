"use client";

import { useState, useEffect } from "react";
import { LifeBuoy, Plus, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { statusLabel, statusClass, priorityLabel, priorityClass } from "@/lib/support-ui";

interface TicketRow {
  id: string;
  number: string;
  subject: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

function SuportePageContent() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/support/tickets");
        const data = await res.json();
        if (active) setTickets(data.tickets ?? []);
      } catch {
        if (active) setTickets([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Suporte</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Abra um chamado e acompanhe as respostas da nossa equipe.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/suporte/novo">
            <Plus className="h-4 w-4 mr-2" />
            Abrir chamado
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <LifeBuoy className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Nenhum chamado ainda</p>
              <p className="text-sm text-muted-foreground mt-1">
                Precisa de ajuda? Abra seu primeiro chamado.
              </p>
            </div>
            <Button asChild className="mt-2">
              <Link href="/dashboard/suporte/novo">
                <Plus className="h-4 w-4 mr-2" />
                Abrir chamado
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <Link
              key={t.id}
              href={`/dashboard/suporte/${t.id}`}
              className="block rounded-lg border bg-card p-4 hover:bg-muted/40 transition-colors duration-150 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">#{t.number}</span>
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${statusClass(t.status)}`}
                    >
                      {statusLabel(t.status)}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${priorityClass(t.priority)}`}
                    >
                      {priorityLabel(t.priority)}
                    </span>
                  </div>
                  <p className="mt-1.5 font-medium truncate">{t.subject}</p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  {formatDistanceToNow(new Date(t.updatedAt), { addSuffix: true, locale: ptBR })}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SuportePage() {
  // Aberto a todo usuário autenticado (auth garantida pelo layout/proxy do dashboard).
  return <SuportePageContent />;
}
