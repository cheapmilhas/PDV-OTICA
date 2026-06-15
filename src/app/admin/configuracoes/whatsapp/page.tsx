import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, MinusCircle, Loader2, MessageCircle } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  CONNECTED: { label: "Conectado", cls: "bg-teal-600 text-white hover:bg-teal-600" },
  CONNECTING: { label: "Conectando", cls: "bg-blue-100 text-blue-800 hover:bg-blue-100" },
  DISCONNECTED: { label: "Desconectado", cls: "bg-gray-100 text-gray-700 hover:bg-gray-100" },
  FAILED: { label: "Falha", cls: "bg-red-100 text-red-800 hover:bg-red-100" },
};

function fmtPhone(raw: string | null): string {
  if (!raw) return "—";
  const d = raw.replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  return `+${d}`;
}

export default async function AdminWhatsappPage() {
  await requireAdmin();

  const connections = await prisma.whatsappConnection.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      status: true,
      connectedNumber: true,
      connectedAt: true,
      lastEventAt: true,
      company: { select: { name: true, slug: true } },
    },
  });

  const connectedCount = connections.filter((c) => c.status === "CONNECTED").length;

  return (
    <div className="p-6">
      <PageHeader
        title="Conexões de WhatsApp"
        subtitle={`${connections.length} óticas com instância · ${connectedCount} conectadas`}
      />

      {connections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <MessageCircle className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Nenhuma conexão ainda</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Quando uma ótica conectar o WhatsApp, ela aparece aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ótica</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead className="hidden md:table-cell">Conectado em</TableHead>
                  <TableHead className="hidden md:table-cell">Último evento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connections.map((c) => {
                  const meta = STATUS_META[c.status] ?? STATUS_META.DISCONNECTED;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.company?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge className={meta.cls}>
                          {c.status === "CONNECTED" ? <CheckCircle2 className="h-3 w-3 mr-1" /> :
                           c.status === "CONNECTING" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> :
                           <MinusCircle className="h-3 w-3 mr-1" />}
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{fmtPhone(c.connectedNumber)}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {c.connectedAt ? new Date(c.connectedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {c.lastEventAt ? new Date(c.lastEventAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
