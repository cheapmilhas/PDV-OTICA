"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, PartyPopper } from "lucide-react";
import toast from "react-hot-toast";
import { WhatsAppButton } from "@/components/whatsapp/whatsapp-button";
import { buildWaMeUrl } from "@/lib/whatsapp-deeplink";

interface FunilRecuperarExameProps {
  /** Só busca quando esta view está visível (aba Recuperar + modo exame). */
  active: boolean;
  branchId: string | null;
}

interface ExamRow {
  customerId: string;
  name: string;
  phone: string | null;
  examAgo: string;
  draftText: string;
}

/**
 * "Fez exame e não comprou" (Sprint 3, #10): clientes que pagaram o exame de
 * vista aqui mas não voltaram pra comprar os óculos. "Dinheiro que escapou".
 * Read-only, reoferta manual (botão abre o WhatsApp com o texto pronto).
 */
export function FunilRecuperarExame({ active, branchId }: FunilRecuperarExameProps) {
  const [rows, setRows] = useState<ExamRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (branchId) params.set("branchId", branchId);
    fetch(`/api/leads/exam-no-purchase?${params}`)
      .then((res) => res.json())
      .then((json) => setRows(json.data?.rows ?? []))
      .catch(() => toast.error("Erro ao carregar quem fez exame"))
      .finally(() => setLoading(false));
  }, [branchId]);

  useEffect(() => {
    if (active) fetchRows();
  }, [active, fetchRows]);

  const total = rows.length;

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-2xl font-bold">
            {total > 0
              ? `${total} ${total === 1 ? "fez exame e não comprou" : "fizeram exame e não compraram"}`
              : "Ninguém pendente por aqui"}
          </p>
          <p className="text-sm text-muted-foreground">
            Fizeram o exame aqui, mas ainda não fecharam os óculos. Ofereça uma condição.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchRows} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {total === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <PartyPopper className="h-10 w-10 text-green-500" />
            <p className="font-medium">Todo mundo fechou os óculos 🎉</p>
            <p className="text-sm text-muted-foreground">
              Ninguém fez só o exame sem comprar na janela recente. Ótima conversão!
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.customerId}>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      fez exame {r.examAgo} · ainda não comprou os óculos
                    </p>
                  </div>
                  {buildWaMeUrl(r.phone) ? (
                    <WhatsAppButton phone={r.phone} draftText={r.draftText} label="Reofertar" />
                  ) : (
                    <span className="text-xs text-muted-foreground">Sem telefone</span>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
