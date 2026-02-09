"use client";

import { useSession } from "next-auth/react";

export function useCurrentUser() {
  const { data: session, status } = useSession();

  return {
    user: session?.user,
    role: session?.user?.role,
    isAdmin: session?.user?.role === "ADMIN",
    isGerente: session?.user?.role === "GERENTE",
    isVendedor: session?.user?.role === "VENDEDOR",
    isCaixa: session?.user?.role === "CAIXA",
    isAtendente: session?.user?.role === "ATENDENTE",
    isLoading: status === "loading",
    isAuthenticated: status === "authenticated",
  };
}
