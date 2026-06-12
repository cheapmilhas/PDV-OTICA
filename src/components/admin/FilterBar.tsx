// src/components/admin/FilterBar.tsx
import Link from "next/link";
import { cn } from "@/lib/utils";

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 mb-4">{children}</div>;
}

interface FilterChipProps {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}

export function FilterChip({ href, active, children }: FilterChipProps) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
        active
          ? "bg-primary text-primary-foreground border-transparent"
          : "bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}
