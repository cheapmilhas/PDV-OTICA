"use client";

import { useState } from "react";
import { Download, Loader2, Mail } from "lucide-react";
import type { InteressadoItem } from "./page";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/admin/EmptyState";

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
              value={planSlug}
              onChange={(e) => handleFilterChange(e.target.value)}
              disabled={loading}
              className="px-3 py-2 rounded-lg bg-background border border-input text-sm text-foreground focus:outline-none focus:border-ring disabled:opacity-60"
            >
              {PLAN_OPTIONS.map((opt) => (
                <option key={opt.slug || "all"} value={opt.slug}>
                  {opt.label}
                </option>
              ))}
            </select>

            <a
              href={csvHref}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary hover:bg-primary/90 text-sm font-medium text-primary-foreground transition-colors"
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </a>
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">E-mail</th>
                  <th className="px-4 py-3 font-medium">Telefone</th>
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 font-medium">Plano</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border last:border-0 hover:bg-muted"
                  >
                    <td className="px-4 py-3 text-foreground">{item.name}</td>
                    <td className="px-4 py-3 text-foreground">{item.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.phone || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.companyName || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded-md bg-muted text-xs text-foreground">
                        {item.planSlug}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(item.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
