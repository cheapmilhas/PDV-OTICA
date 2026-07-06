// src/components/admin/DataTablePagination.tsx
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DataTablePaginationProps {
  /** Página atual (1-based). */
  page: number;
  /** Itens por página. */
  pageSize: number;
  /** Total de itens (todas as páginas). */
  total: number;
  /**
   * Constrói o href de uma página preservando os demais filtros.
   * Ex.: (p) => `/admin/clientes?${new URLSearchParams({ ...params, page: String(p) })}`
   */
  hrefForPage: (page: number) => string;
}

/**
 * Rodapé de paginação para listagens. Renderiza links reais (compartilháveis,
 * funcionam sem JS) e mostra a faixa "N–M de TOTAL". Server-component friendly:
 * a página vive na URL (query param), seguindo a regra de deep linking.
 */
export function DataTablePagination({
  page,
  pageSize,
  total,
  hrefForPage,
}: DataTablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  const hasPrev = current > 1;
  const hasNext = current < totalPages;

  const navClasses = (enabled: boolean) =>
    cn(
      buttonVariants({ variant: "outline", size: "sm" }),
      "gap-1",
      !enabled && "pointer-events-none opacity-50",
    );

  return (
    <nav
      className="flex items-center justify-between gap-4 pt-4"
      aria-label="Paginação"
    >
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total === 0 ? (
          "Nenhum resultado"
        ) : (
          <>
            <span className="font-medium text-foreground">
              {from}–{to}
            </span>{" "}
            de{" "}
            <span className="font-medium text-foreground">{total}</span>
          </>
        )}
      </p>

      <div className="flex items-center gap-2">
        <Link
          href={hasPrev ? hrefForPage(current - 1) : "#"}
          aria-disabled={!hasPrev}
          tabIndex={hasPrev ? undefined : -1}
          className={navClasses(hasPrev)}
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </Link>
        <span className="text-sm text-muted-foreground tabular-nums px-1">
          {current} / {totalPages}
        </span>
        <Link
          href={hasNext ? hrefForPage(current + 1) : "#"}
          aria-disabled={!hasNext}
          tabIndex={hasNext ? undefined : -1}
          className={navClasses(hasNext)}
        >
          Próxima
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </nav>
  );
}
