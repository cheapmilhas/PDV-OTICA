"use client";

import { usePermissions } from "@/hooks/usePermissions";
import { useRouter } from "next/navigation";
import { useEffect, ReactNode } from "react";
import { Loader2, ShieldX } from "lucide-react";

interface PageGuardProps {
  permission?: string;
  permissions?: string[];
  mode?: "any" | "all";
  children: ReactNode;
  redirectTo?: string;
}

/**
 * Protege uma página inteira. Redireciona para redirectTo se sem permissão.
 *
 * @example
 * export default function VendasPage() {
 *   return (
 *     <PageGuard permission="sales.view">
 *       <div>Conteúdo das vendas</div>
 *     </PageGuard>
 *   );
 * }
 */
export function PageGuard({
  permission,
  permissions,
  mode = "any",
  children,
  redirectTo = "/dashboard",
}: PageGuardProps) {
  const { hasPermission, hasAnyPermission, hasAllPermissions, isLoading } =
    usePermissions();
  const router = useRouter();

  const canAccess = (() => {
    if (isLoading) return null; // null = aguardando
    if (permission) return hasPermission(permission);
    if (permissions && permissions.length > 0) {
      return mode === "all"
        ? hasAllPermissions(permissions)
        : hasAnyPermission(permissions);
    }
    return true;
  })();

  useEffect(() => {
    if (canAccess === false) {
      router.replace(redirectTo);
    }
  }, [canAccess, router, redirectTo]);

  if (canAccess === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (canAccess === false) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
        <ShieldX className="h-10 w-10" />
        <p className="text-sm">Sem permissão para acessar esta página.</p>
      </div>
    );
  }

  return <>{children}</>;
}
