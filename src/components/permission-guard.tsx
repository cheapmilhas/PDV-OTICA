"use client";

import { usePermission } from "@/hooks/use-permission";
import { useSession } from "next-auth/react";
import { ReactNode } from "react";

interface PermissionGuardProps {
  permission?: string;
  permissions?: string[];
  requireAll?: boolean; // Se true, precisa de TODAS as permissions
  fallback?: ReactNode; // O que mostrar se não tiver permissão
  children: ReactNode;
}

export function PermissionGuard({
  permission,
  permissions,
  requireAll = false,
  fallback = null,
  children,
}: PermissionGuardProps) {
  const { data: session } = useSession();
  const { hasPermission, hasAnyPermission, hasAllPermissions, isLoading } =
    usePermission();

  // ADMIN sempre mostra tudo - verificação direta da sessão
  if (session?.user?.role === "ADMIN") {
    return <>{children}</>;
  }

  if (isLoading) {
    return null; // Ou um skeleton/loading
  }

  // Se não tem permissão definida, mostra o conteúdo
  if (!permission && (!permissions || permissions.length === 0)) {
    return <>{children}</>;
  }

  // Verificar permissão única
  if (permission) {
    if (hasPermission(permission)) {
      return <>{children}</>;
    }
    return <>{fallback}</>;
  }

  // Verificar múltiplas permissões
  if (permissions && permissions.length > 0) {
    const hasAccess = requireAll
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);

    if (hasAccess) {
      return <>{children}</>;
    }
  }

  return <>{fallback}</>;
}
