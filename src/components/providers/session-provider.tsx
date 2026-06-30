"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { ReactNode } from "react";

interface SessionProviderProps {
  children: ReactNode;
  /**
   * Sessão pré-resolvida no SERVIDOR (via `auth()` no layout). Quando passada, o
   * `useSession()` do cliente já nasce `authenticated` no 1º paint — elimina a
   * janela de "loading" da cold start que travava o `ProtectedRoute` em
   * "Verificando permissões…". Opcional: sem ela o provider funciona como antes
   * (busca a sessão no cliente).
   */
  session?: Session | null;
}

/**
 * Client-side SessionProvider wrapper para NextAuth v5
 *
 * Necessário para usar useSession() em componentes client.
 *
 * `refetchOnWindowFocus={false}`: não re-busca a sessão a cada foco de janela —
 * a sessão é JWT (estável por 30 dias), então o refetch só gerava requests
 * redundantes e re-renders.
 */
export function SessionProvider({ children, session }: SessionProviderProps) {
  return (
    <NextAuthSessionProvider session={session} refetchOnWindowFocus={false}>
      {children}
    </NextAuthSessionProvider>
  );
}
