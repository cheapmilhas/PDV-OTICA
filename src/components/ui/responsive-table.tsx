"use client";

import { useEffect, useRef, useState } from "react";
import { Table } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface ResponsiveTableProps {
  children: React.ReactNode;
  className?: string;
  /** Largura mínima da tabela (default 640px). Ajuste para tabelas mais largas. */
  minWidth?: number;
  /**
   * Modo cartão no phone (< md): cada linha vira um cartão com pares
   * rótulo→valor. Requer `data-label="<Cabeçalho>"` em cada TableCell (o
   * rótulo vem do TableHead correspondente). Linhas de estado vazio com
   * colSpan devem marcar a célula com `data-label=""` (full-width, sem rótulo).
   * Sem esta prop, o comportamento é o scroll horizontal padrão.
   */
  cards?: boolean;
}

/**
 * Wrapper de tabela responsiva.
 * - Padrão: scroll horizontal em telas estreitas + indicador de overflow.
 * - `cards`: no phone vira cartões (1 linha = 1 cartão), legível sem scroll
 *   lateral. Use em tabelas densas que o usuário abre no celular.
 *
 * Use no lugar de <Table> direto sempre que a tabela tiver mais de 4 colunas
 * ou colunas com conteúdo longo.
 */
export function ResponsiveTable({
  children,
  className,
  minWidth = 640,
  cards = false,
}: ResponsiveTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      const overflow = el.scrollWidth > el.clientWidth;
      setHasOverflow(overflow);
      setScrolledToEnd(
        Math.abs(el.scrollWidth - el.clientWidth - el.scrollLeft) < 4,
      );
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="relative w-full">
      <div
        ref={scrollRef}
        className={cn(
          // No modo cartão o scroll horizontal só entra no desktop (md+); no
          // phone a tabela vira cartão e não deve rolar lateralmente.
          cards ? "w-full md:overflow-x-auto md:-mx-0" : "w-full overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0",
          className,
        )}
      >
        <Table
          className={cn(cards && "card-table")}
          // No modo cartão, minWidth só vale no desktop — no phone o cartão
          // ocupa a largura natural. Aplicamos via style só quando não-cards
          // ou via CSS que zera min-width no mobile (ver .card-table).
          style={{ minWidth: `${minWidth}px` }}
        >
          {children}
        </Table>
      </div>

      {hasOverflow && !scrolledToEnd && !cards && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent md:hidden"
        />
      )}
    </div>
  );
}
