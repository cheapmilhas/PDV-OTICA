"use client";

import { usePermissions } from "@/hooks/usePermissions";
import { ReactNode } from "react";

interface CanProps {
  permission?: string;
  permissions?: string[];
  mode?: "any" | "all";
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Renderiza children apenas se o usuário tiver a permissão necessária.
 *
 * @example
 * // Esconder botão sem permissão
 * <Can permission="sales.create">
 *   <Button>Nova Venda</Button>
 * </Can>
 *
 * // Com fallback (botão desabilitado)
 * <Can permission="sales.cancel" fallback={<Button disabled>Cancelar</Button>}>
 *   <Button>Cancelar</Button>
 * </Can>
 *
 * // Múltiplas permissões (qualquer uma)
 * <Can permissions={["sales.edit", "sales.create"]} mode="any">
 *   <Button>Editar</Button>
 * </Can>
 */
export function Can({
  permission,
  permissions,
  mode = "any",
  children,
  fallback = null,
}: CanProps) {
  const { hasPermission, hasAnyPermission, hasAllPermissions, isLoading } =
    usePermissions();

  if (isLoading) return null;

  let canAccess = false;

  if (permission) {
    canAccess = hasPermission(permission);
  } else if (permissions && permissions.length > 0) {
    canAccess =
      mode === "all"
        ? hasAllPermissions(permissions)
        : hasAnyPermission(permissions);
  } else {
    canAccess = true; // Sem permissão definida = sempre visível
  }

  return canAccess ? <>{children}</> : <>{fallback}</>;
}
