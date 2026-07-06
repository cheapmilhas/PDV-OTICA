"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Loader2, Mail } from "lucide-react";
import type { InteressadoItem } from "./page";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/admin/EmptyState";
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

export function InteressadosClient({ initial }: { initial: InteressadoItem[] }) {
  const [items, setItems] = useState<InteressadoItem[]>(initial);
  const [planSlug, setPlanSlug] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleFilterChange(slug: string) {
    setPlanSlug(slug);
    setLoading(true);
    try {
      const qs = slug ? `?planSlug=${encodeURIComponent(slug)}` : "";
      const res = await fetch(`/api/admin/plan-interests${qs}`);
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data.items) ? data.items : []);
      }
    } catch {
      // mantém a lista atual em caso de erro de rede
    } finally {
      setLoading(false);
    }
  }

  const csvHref = planSlug
    ? `/api/admin/plan-interests?planSlug=${encodeURIComponent(planSlug)}&format=csv`
    : `/api/admin/plan-interests?format=csv`;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Interessados"
        subtitle='Visitantes que pediram para ser avisados sobre planos "Em breve".'
        actions={
          <div className="flex items-center gap-3">
            <select
              aria-label="Filtrar por plano"
              value={planSlug}
              onChange={(e) => handleFilterChange(e.target.value)}
              disabled={loading}
              className="px-3 py-2 rounded-lg bg-background border border-input text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {PLAN_OPTIONS.map((opt) => (
                <option key={opt.slug || "all"} value={opt.slug}>
                  {opt.label}
                </option>
              ))}
            </select>

            <Button asChild>
              <Link href={csvHref}>
                <Download className="h-4 w-4" />
                Exportar CSV
              </Link>
            </Button>
          </div>
        }
      />

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Carregando...
          </div>
        ) : items.length === 0 ? (
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

      {!loading && items.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? "interessado" : "interessados"}
        </p>
      )}
    </div>
  );
}
