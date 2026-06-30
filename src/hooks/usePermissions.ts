"use client";

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
  const { permissions, role, isAdmin, status, fetchingCustom, loadingCapped } =
    useSharedPermissions();

  // Contrato PRESERVADO: bloqueia enquanto a sessão resolve OU um não-ADMIN busca
  // os overrides; libera assim que há resposta definitiva (autenticado+resolvido,
  // ou não-autenticado). ADMIN resolve sem fetch. Cap evita bloqueio eterno.
  const rawLoading =
    status === "loading" || (status === "authenticated" && !isAdmin && fetchingCustom);
  const isLoading = rawLoading && !loadingCapped;

  const hasPermission = (permission: string): boolean => {
    if (isAdmin) return true;
    return permissions.includes(permission);
  };

  const hasAllPermissions = (permissionList: string[]): boolean => {
    if (isAdmin) return true;
    return permissionList.every((p) => permissions.includes(p));
  };

  const hasAnyPermission = (permissionList: string[]): boolean => {
    if (isAdmin) return true;
    return permissionList.some((p) => permissions.includes(p));
  };

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
