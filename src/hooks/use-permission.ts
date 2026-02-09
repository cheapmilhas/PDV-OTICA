"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";

interface UsePermissionResult {
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
  permissions: string[];
  isLoading: boolean;
  role: string | null;
}

export function usePermission(): UsePermissionResult {
  const { data: session, status } = useSession();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchPermissions() {
      if (status === "loading") {
        setIsLoading(true);
        return;
      }

      if (!session?.user?.id) {
        console.log("⚠️ usePermission: Sem sessão/usuário");
        setPermissions([]);
        setIsLoading(false);
        return;
      }

      // ADMIN sempre tem todas as permissões
      if (session.user.role === "ADMIN") {
        console.log("🔑 usePermission: Usuário ADMIN - todas as permissões");
        setPermissions(["*"]); // Símbolo especial para "todas"
        setIsLoading(false);
        return;
      }

      try {
        console.log(`🔍 usePermission: Buscando permissões para ${session.user.email}`);
        const response = await fetch(`/api/users/${session.user.id}/permissions`);

        if (!response.ok) {
          console.error("❌ usePermission: Erro ao buscar permissões", response.status);
          setPermissions([]);
          setIsLoading(false);
          return;
        }

        const data = await response.json();
        console.log("📦 usePermission: Resposta da API:", data);

        // Extrair códigos de permissões efetivas
        const effectivePermissions = data.effectivePermissions || [];
        const permCodes = effectivePermissions.map((code: string) => code);

        console.log(`✅ usePermission: ${permCodes.length} permissões carregadas:`, permCodes);
        setPermissions(permCodes);
      } catch (error) {
        console.error("❌ usePermission: Erro ao buscar permissões:", error);
        setPermissions([]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchPermissions();
  }, [session?.user?.id, session?.user?.role, status]);

  const hasPermission = (permission: string): boolean => {
    // ADMIN tem tudo
    if (session?.user?.role === "ADMIN") {
      return true;
    }

    // Verifica se tem a permissão específica
    const has = permissions.includes(permission);
    console.log(`🔒 hasPermission("${permission}"): ${has}`);
    return has;
  };

  const hasAnyPermission = (perms: string[]): boolean => {
    // ADMIN tem tudo
    if (session?.user?.role === "ADMIN") {
      return true;
    }

    const has = perms.some((p) => permissions.includes(p));
    console.log(`🔒 hasAnyPermission(${perms}): ${has}`);
    return has;
  };

  const hasAllPermissions = (perms: string[]): boolean => {
    // ADMIN tem tudo
    if (session?.user?.role === "ADMIN") {
      return true;
    }

    const has = perms.every((p) => permissions.includes(p));
    console.log(`🔒 hasAllPermissions(${perms}): ${has}`);
    return has;
  };

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    permissions,
    isLoading,
    role: session?.user?.role || null,
  };
}
