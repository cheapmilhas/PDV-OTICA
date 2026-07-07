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
  interessados:   "Interessados",
  saude:          "Saúde",
  sincronizacao:  "Sincronização",
  emails:         "Emails",
  seguranca:      "Segurança",
  ia:             "IA",
  whatsapp:       "WhatsApp",
  nova:           "Nova",
};

// Quando um segmento parece um ID (cuid/valor muito longo), rotulamos pelo TIPO
// da entidade-pai em vez do genérico "Detalhes". Ex.: /admin/clientes/{cuid} →
// "Cliente". Fallback "Detalhes" só quando o pai não estiver mapeado.
const PARENT_TO_DETAIL_LABEL: Record<string, string> = {
  clientes: "Cliente",
  tickets:  "Ticket",
  faturas:  "Fatura",
};

// Segmentos que NÃO têm página própria (só agrupam rotas filhas). O crumb
// aparece como texto, nunca como link — senão levaria a um 404 (ex.: /admin/suporte,
// que só existe como /admin/suporte/tickets).
const NON_LINKABLE = new Set(["suporte"]);

export function AdminBreadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean); // ["admin", "clientes", "abc123"]

  // Monta os crumbs com href acumulado
  const crumbs = segments.map((seg, idx) => {
    const href = "/" + segments.slice(0, idx + 1).join("/");
    // IDs (cuid) são rotulados pelo TIPO da entidade-pai (ex.: clientes → "Cliente"),
    // com fallback "Detalhes" quando o pai não estiver mapeado.
    const isId = seg.length > 15 && !SEGMENT_LABELS[seg];
    const parent = idx > 0 ? segments[idx - 1] : undefined;
    const label = isId
      ? (parent ? PARENT_TO_DETAIL_LABEL[parent] ?? "Detalhes" : "Detalhes")
      : (SEGMENT_LABELS[seg] ?? seg);
    const isLast = idx === segments.length - 1;
    // Não linkar segmentos sem página (evita 404) nem IDs (rota de detalhe já é o pai).
    const linkable = !NON_LINKABLE.has(seg) && !isId;
    return { href, label, isLast, linkable };
  });

  if (crumbs.length <= 1) return null; // só "admin" → sem breadcrumb

  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground" aria-label="Breadcrumb">
      {crumbs.map((crumb, idx) => (
        <span key={crumb.href} className="flex items-center gap-1">
          {idx > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
          {crumb.isLast || !crumb.linkable ? (
            <span className={crumb.isLast ? "text-foreground font-medium" : undefined}>{crumb.label}</span>
          ) : (
            <Link href={crumb.href} className="hover:text-foreground transition-colors">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
