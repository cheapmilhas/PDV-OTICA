import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Fragment } from "react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <Fragment key={index}>
            {index > 0 && <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />}
            {isLast || !item.href ? (
              <span className={isLast ? "font-medium text-foreground" : undefined}>
                {item.label}
              </span>
            ) : (
              <Link href={item.href} className="hover:text-foreground transition-colors">
                {item.label}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
