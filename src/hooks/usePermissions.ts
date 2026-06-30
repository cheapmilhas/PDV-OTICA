"use client";

import { useCallback } from "react";
import { useSharedPermissions } from "@/components/providers/permissions-provider";

/**
 * Hook para verificar permissões do usuário logado (plural).
 *
 * Agora é um SHIM fino sobre o estado compartilhado (`useSharedPermissions`):
 * antes cada chamada fazia seu próprio `useSession()` + fetch de
 * `/api/users/:id/permissions`; com ~30 consumidores isso eram N fetches
 * idênticos por página. Agora todos leem 1 fetch só do provider.
 *
 * @example
 * ```tsx
 * const { hasPermission, isLoading } = usePermissions();
 * if (hasPermission('sales.create')) { ... }
 * ```
 */
export function usePermissions() {
  const { permissions, role, isAdmin, status, customLoading, loadingCapped } =
    useSharedPermissions();

  // Contrato PRESERVADO: bloqueia enquanto a sessão resolve OU um não-ADMIN ainda
  // não teve as permissões resolvidas; libera assim que há resposta definitiva.
  // ADMIN resolve sem fetch. Cap evita bloqueio eterno.
  const rawLoading = status === "loading" || customLoading;
  const isLoading = rawLoading && !loadingCapped;

  // Memoizados (como o hook singular) p/ não recriar referência a cada render —
  // com o provider compartilhado, evita re-render de consumidores React.memo.
  const hasPermission = useCallback(
    (permission: string): boolean => (isAdmin ? true : permissions.includes(permission)),
    [isAdmin, permissions],
  );

  const hasAllPermissions = useCallback(
    (permissionList: string[]): boolean =>
      isAdmin ? true : permissionList.every((p) => permissions.includes(p)),
    [isAdmin, permissions],
  );

  const hasAnyPermission = useCallback(
    (permissionList: string[]): boolean =>
      isAdmin ? true : permissionList.some((p) => permissions.includes(p)),
    [isAdmin, permissions],
  );

  return {
    permissions,
    hasPermission,
    hasAllPermissions,
    hasAnyPermission,
    isLoading,
    isAdmin,
    // Quem pode VER registros cancelados (vendas/OS/parcelas). Espelha o
    // helper de server canSeeCanceled() — valores Prisma "ADMIN"/"GERENTE".
    canSeeCanceled: role === "ADMIN" || role === "GERENTE",
  };
}
