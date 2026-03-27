"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

const SEGMENT_LABELS: Record<string, string> = {
  admin:          "Admin",
  clientes:       "Clientes",
  novo:           "Novo Cliente",
  usuarios:       "Usuários",
  dashboard:      "Dashboard",
  financeiro:     "Financeiro",
  faturas:        "Faturas",
  inadimplencia:  "Inadimplência",
  relatorios:     "Relatórios",
  configuracoes:  "Configurações",
  planos:         "Planos",
  equipe:         "Equipe",
  logs:           "Logs",
  suporte:        "Suporte",
  tickets:        "Tickets",
  assinaturas:    "Assinaturas",
};

export function AdminBreadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean); // ["admin", "clientes", "abc123"]

  // Monta os crumbs com href acumulado
  const crumbs = segments.map((seg, idx) => {
    const href = "/" + segments.slice(0, idx + 1).join("/");
    // IDs (cuid) ficam como "Detalhes" ou pelo índice anterior
    const isId = seg.length > 15 && !SEGMENT_LABELS[seg];
    const label = isId ? "Detalhes" : (SEGMENT_LABELS[seg] ?? seg);
    const isLast = idx === segments.length - 1;
    return { href, label, isLast };
  });

  if (crumbs.length <= 1) return null; // só "admin" → sem breadcrumb

  return (
    <nav className="flex items-center gap-1 text-xs text-gray-500" aria-label="Breadcrumb">
      {crumbs.map((crumb, idx) => (
        <span key={crumb.href} className="flex items-center gap-1">
          {idx > 0 && <ChevronRight className="h-3 w-3 text-gray-700" />}
          {crumb.isLast ? (
            <span className="text-gray-300 font-medium">{crumb.label}</span>
          ) : (
            <Link href={crumb.href} className="hover:text-gray-300 transition-colors">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
