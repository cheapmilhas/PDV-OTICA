"use client";

import { useEffect, useRef, useState } from "react";
import { Table } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface ResponsiveTableProps {
  children: React.ReactNode;
  className?: string;
  /** Largura mínima da tabela (default 640px). Ajuste para tabelas mais largas. */
  minWidth?: number;
}

/**
 * Wrapper de tabela com scroll horizontal em telas estreitas + indicador visual
 * (sombra na borda direita) quando há conteúdo cortado.
 *
 * Use no lugar de <Table> direto sempre que a tabela tiver mais de 4 colunas
 * ou colunas com conteúdo longo.
 */
export function ResponsiveTable({
  children,
  className,
  minWidth = 640,
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
          "w-full overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0",
          className,
        )}
      >
        <Table style={{ minWidth: `${minWidth}px` }}>{children}</Table>
      </div>

      {hasOverflow && !scrolledToEnd && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent md:hidden"
        />
      )}
    </div>
  );
}
