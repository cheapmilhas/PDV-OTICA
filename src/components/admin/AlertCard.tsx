// src/components/admin/AlertCard.tsx
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertCardVariants = cva(
  "flex items-center gap-3 p-4 rounded-xl border transition-colors",
  {
    variants: {
      tone: {
        danger:
          "border-destructive/25 bg-destructive/10 hover:bg-destructive/15 text-destructive",
        warning:
          "border-warning/30 bg-warning/10 hover:bg-warning/15 text-warning",
        info: "border-info/25 bg-info/10 hover:bg-info/15 text-info",
        success:
          "border-success/25 bg-success/10 hover:bg-success/15 text-success",
        neutral:
          "border-border bg-card hover:bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

interface AlertCardProps extends VariantProps<typeof alertCardVariants> {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Se informado, o card vira um link navegável. */
  href?: string;
  className?: string;
}

/**
 * Card de alerta/ação com tom semântico via tokens (theme-aware).
 * Substitui os antigos cards com cores hardcoded (red-50/amber-50/blue-50),
 * unificando o visual do dashboard. Quando `href` é passado, renderiza um
 * <Link> clicável (cursor-pointer herdado do <a>).
 */
export function AlertCard({
  icon: Icon,
  title,
  description,
  href,
  tone,
  className,
}: AlertCardProps) {
  const content = (
    <>
      <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-xs opacity-80">{description}</p>}
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cn(alertCardVariants({ tone }), className)}>
        {content}
      </Link>
    );
  }

  return (
    <div className={cn(alertCardVariants({ tone }), className)}>{content}</div>
  );
}
