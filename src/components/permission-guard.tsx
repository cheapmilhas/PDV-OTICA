"use client";

import { usePermission } from "@/hooks/use-permission";
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
  const { hasPermission, hasAnyPermission, hasAllPermissions, isLoading } =
    usePermission();

  if (isLoading) {
    return null; // Ou um skeleton/loading
  }

  // Verificar permissão única
  if (permission) {
    if (!hasPermission(permission)) {
      return <>{fallback}</>;
    }
    return <>{children}</>;
  }

  // Verificar múltiplas permissões
  if (permissions && permissions.length > 0) {
    const hasAccess = requireAll
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);

    if (!hasAccess) {
      return <>{fallback}</>;
    }
    return <>{children}</>;
  }

  // Se não especificou permissão, mostrar
  return <>{children}</>;
}
