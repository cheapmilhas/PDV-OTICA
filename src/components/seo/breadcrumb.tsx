import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbCrumb {
  /** Nome exibido. */
  name: string;
  /** Caminho relativo (ex: "/funcionalidades"). Omita no último item (página atual). */
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbCrumb[];
}

/**
 * Trilha de navegação visual (breadcrumb) acessível.
 * O último item representa a página atual e não é um link.
 */
export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="breadcrumb" className="mb-6">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.name}-${index}`} className="flex items-center gap-1.5">
              {index > 0 && (
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                  style={{ color: "var(--lp-subtle)" }}
                />
              )}
              {isLast || !item.href ? (
                <span aria-current="page" style={{ color: "var(--lp-foreground)" }}>
                  {item.name}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="transition-colors hover:underline"
                  style={{ color: "var(--lp-muted)" }}
                >
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
