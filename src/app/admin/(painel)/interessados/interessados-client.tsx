import Link from "next/link";
import { Download, Mail } from "lucide-react";
import type { InteressadoItem } from "./page";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/admin/EmptyState";
import { FilterBar, FilterChip } from "@/components/admin/FilterBar";
import { Button } from "@/components/ui/button";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import {
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

const PLAN_OPTIONS = [
  { slug: "", label: "Todos os planos" },
  { slug: "basico", label: "Básico" },
  { slug: "basico-nf", label: "Básico + NF" },
  { slug: "profissional", label: "Profissional" },
  { slug: "rede", label: "Rede" },
];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Lista de interessados. O filtro por plano é aplicado no servidor (page.tsx lê
 * ?plan=slug) e navegado por chips (FilterChip como Link) — mesmo padrão de
 * assinaturas/faturas. URL shareable e botão "voltar" continuam funcionando.
 */
export function InteressadosClient({
  items,
  planSlug,
}: {
  items: InteressadoItem[];
  planSlug: string;
}) {
  const csvHref = planSlug
    ? `/api/admin/plan-interests?planSlug=${encodeURIComponent(planSlug)}&format=csv`
    : `/api/admin/plan-interests?format=csv`;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Interessados"
        subtitle='Visitantes que pediram para ser avisados sobre planos "Em breve".'
        actions={
          <Button asChild>
            <Link href={csvHref}>
              <Download className="h-4 w-4" />
              Exportar CSV
            </Link>
          </Button>
        }
      />

      <FilterBar>
        {PLAN_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.slug || "all"}
            href={opt.slug ? `/admin/interessados?plan=${encodeURIComponent(opt.slug)}` : "/admin/interessados"}
            active={planSlug === opt.slug}
          >
            {opt.label}
          </FilterChip>
        ))}
      </FilterBar>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {items.length === 0 ? (
          <EmptyState icon={Mail} message="Nenhum interessado ainda" />
        ) : (
          <ResponsiveTable minWidth={720}>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-foreground">{item.name}</TableCell>
                  <TableCell className="text-foreground">{item.email}</TableCell>
                  <TableCell className="text-muted-foreground">{item.phone || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{item.companyName || "—"}</TableCell>
                  <TableCell>
                    <span className="inline-flex px-2 py-0.5 rounded-md bg-muted text-xs text-foreground">
                      {item.planSlug}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatDate(item.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ResponsiveTable>
        )}
      </div>

      {items.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? "interessado" : "interessados"}
        </p>
      )}
    </div>
  );
}
