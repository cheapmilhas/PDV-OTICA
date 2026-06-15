"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, MessageSquare, CheckCircle2, XCircle, MinusCircle } from "lucide-react";

interface HistoryItem {
  id: string;
  type: string;
  status: "SENT" | "FAILED" | "SKIPPED";
  skipReason: string | null;
  error: string | null;
  phone: string;
  content: string;
  customerName: string | null;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  SHARE_LINK: "Recibo",
  OS_READY: "Óculos pronto",
  POST_SALE: "Pós-venda",
  BIRTHDAY: "Aniversário",
  INSTALLMENT_DUE: "Crediário",
};

const SKIP_LABEL: Record<string, string> = {
  feature_off: "desativado",
  not_connected: "sem conexão",
  no_consent: "sem opt-in",
  no_phone: "sem telefone",
  already_sent: "já enviado",
};

function StatusBadge({ item }: { item: HistoryItem }) {
  if (item.status === "SENT") {
    return <Badge className="bg-teal-600 hover:bg-teal-600"><CheckCircle2 className="h-3 w-3 mr-1" />Enviado</Badge>;
  }
  if (item.status === "FAILED") {
    return <Badge variant="secondary" className="bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="h-3 w-3 mr-1" />Falhou</Badge>;
  }
  return (
    <Badge variant="secondary" className="bg-gray-100 text-gray-700 hover:bg-gray-100">
      <MinusCircle className="h-3 w-3 mr-1" />
      {item.skipReason ? SKIP_LABEL[item.skipReason] ?? "ignorado" : "ignorado"}
    </Badge>
  );
}

export function WhatsappHistoryClient() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchPage = useCallback(async (after: string | null) => {
    const qs = new URLSearchParams({ limit: "30" });
    if (after) qs.set("cursor", after);
    const res = await fetch(`/api/whatsapp/history?${qs}`);
    const result = await res.json();
    if (result.success) {
      setItems((prev) => (after ? [...prev, ...result.data.items] : result.data.items));
      setCursor(result.data.nextCursor);
      setHasMore(Boolean(result.data.nextCursor));
    }
  }, []);

  useEffect(() => {
    fetchPage(null).finally(() => setLoading(false));
  }, [fetchPage]);

  async function loadMore() {
    setLoadingMore(true);
    await fetchPage(cursor);
    setLoadingMore(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <MessageSquare className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Nenhuma mensagem ainda</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            Quando as automações enviarem mensagens, o histórico aparece aqui.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Mensagem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.customerName ?? <span className="text-muted-foreground">—</span>}
                    <div className="text-xs text-muted-foreground">{item.phone}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{TYPE_LABEL[item.type] ?? item.type}</Badge>
                  </TableCell>
                  <TableCell><StatusBadge item={item} /></TableCell>
                  <TableCell className="hidden md:table-cell max-w-xs">
                    <span className="text-sm text-muted-foreground line-clamp-2">{item.content}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Carregar mais
          </Button>
        </div>
      )}
    </div>
  );
}
