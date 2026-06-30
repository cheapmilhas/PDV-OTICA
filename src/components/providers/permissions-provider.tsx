"use client";

import { useSession } from "next-auth/react";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

/**
 * Teto de tempo (ms) que a UI bloqueia esperando a sessão/permissões. Se passar
 * disso (cold start serverless lenta, estado preso em `loading`), o estado PARA
 * de bloquear e libera a renderização — uma rota protegida nunca deve ficar em
 * "Verificando permissões…" para sempre. A verificação real de acesso continua
 * valendo; o cap só impede o spinner eterno.
 */
export const PERMISSION_LOADING_CAP_MS = 4000;

/**
 * Estado BRUTO de permissões, compartilhado por TODOS os consumidores via context.
 * É a fonte única: faz UM `useSession()` e UM fetch de `/api/users/:id/permissions`
 * (só p/ não-admin), eliminando os N fetches idênticos redundantes que existiam
 * quando cada hook buscava por conta própria.
 *
 * Os hooks públicos (`usePermission` / `usePermissions`) leem este estado e dão a
 * ele o FORMATO que cada um sempre teve (preservando suas semânticas de
 * `isLoading`). Ver permissions-core.ts.
 */
export interface PermissionsState {
  /** Array de permissões efetivas. ADMIN = ["*"] (curto-circuito, sem fetch). */
  permissions: string[];
  role: string | null;
  isAdmin: boolean;
  /** status do next-auth: "loading" | "authenticated" | "unauthenticated". */
  status: string;
  /** true enquanto o fetch de permissões custom (não-admin) está em voo. */
  fetchingCustom: boolean;
  /** true quando o cap de tempo estourou (destrava a UI). */
  loadingCapped: boolean;
  refetch: () => void;
}

/**
 * Hook NÚCLEO: contém TODA a lógica de sessão+fetch UMA vez. Usado pelo provider
 * (caminho normal) e, como fallback, pelos hooks públicos quando renderizam FORA
 * de um provider (ex.: testes, telas isoladas) — assim nada quebra sem o wrapper.
 */
export function usePermissionsCore(opts?: { enabled?: boolean }): PermissionsState {
  // `enabled=false`: o núcleo NÃO faz fetch (usado como fallback quando um
  // provider já é a fonte — evita fetch duplicado violar o "1 fetch só").
  const enabled = opts?.enabled ?? true;
  const { data: session, status } = useSession();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [fetchingCustom, setFetchingCustom] = useState(false);
  const [loadingCapped, setLoadingCapped] = useState(false);
  // Evita disparo duplo do fetch (React strict-mode / reexecução de efeito).
  const fetchKeyRef = useRef<string | null>(null);

  const isAdmin = session?.user?.role === "ADMIN";
  const rawLoading =
    status === "loading" || (status === "authenticated" && !isAdmin && fetchingCustom);

  // Cap: arma enquanto realmente carrega; reseta quando resolve.
  useEffect(() => {
    if (!enabled) return;
    if (!rawLoading) {
      setLoadingCapped(false);
      return;
    }
    const t = setTimeout(() => setLoadingCapped(true), PERMISSION_LOADING_CAP_MS);
    return () => clearTimeout(t);
  }, [rawLoading, enabled]);

  const fetchPermissions = useCallback(async () => {
    if (status === "loading") return;
    if (!session?.user?.id) {
      setPermissions([]);
      return;
    }
    // ADMIN tem tudo — sem rede.
    if (session.user.role === "ADMIN") {
      setPermissions(["*"]);
      return;
    }

    setFetchingCustom(true);
    try {
      const response = await fetch(`/api/users/${session.user.id}/permissions`, {
        cache: "no-store", // permissões custom sempre frescas (revogação dinâmica)
      });
      if (!response.ok) {
        setPermissions([]);
        return;
      }
      const data = await response.json();
      setPermissions(data.effectivePermissions || []);
    } catch {
      setPermissions([]);
    } finally {
      setFetchingCustom(false);
    }
  }, [session?.user?.id, session?.user?.role, status]);

  // Dispara o fetch 1× por (userId, role, status) — a ref impede o disparo duplo
  // do strict-mode e re-fetches por re-render sem mudança real de identidade.
  useEffect(() => {
    if (!enabled) return;
    const key = `${status}:${session?.user?.id ?? ""}:${session?.user?.role ?? ""}`;
    if (fetchKeyRef.current === key) return;
    fetchKeyRef.current = key;
    fetchPermissions();
  }, [enabled, fetchPermissions, status, session?.user?.id, session?.user?.role]);

  // refetch manual: dispara o fetch UMA vez, direto. NÃO zera a fetchKeyRef —
  // zerá-la faria o efeito acima re-disparar no próximo render (fetch duplo).
  // A key permanece a da identidade atual; este é um refetch pontual idempotente.
  const refetch = useCallback(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  return {
    permissions,
    role: session?.user?.role || null,
    isAdmin,
    status,
    fetchingCustom,
    loadingCapped,
    refetch,
  };
}

const PermissionsContext = createContext<PermissionsState | null>(null);

/**
 * Provider ÚNICO de permissões. Montar UMA vez, alto na árvore do dashboard
 * (dentro do SessionProvider). Faz 1 fetch compartilhado; todos os hooks leem
 * daqui. Componente client (usa hooks) — pode ser renderizado por um layout
 * server normalmente.
 */
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const state = usePermissionsCore();
  return (
    <PermissionsContext.Provider value={state}>{children}</PermissionsContext.Provider>
  );
}

/**
 * Lê o estado compartilhado. Se NÃO houver provider acima (telas isoladas,
 * testes), cai no núcleo local — comportamento idêntico, só sem o
 * compartilhamento de fetch. Nunca quebra por falta do wrapper.
 *
 * Regra dos hooks: `usePermissionsCore` é SEMPRE chamado (não pode ser
 * condicional), mas com `enabled: !ctx` — quando o provider existe, o núcleo
 * fallback fica inerte (não busca, não arma cap), então só o provider faz o
 * fetch. Quando não existe, o fallback assume e funciona normalmente.
 */
export function useSharedPermissions(): PermissionsState {
  const ctx = useContext(PermissionsContext);
  const fallback = usePermissionsCore({ enabled: !ctx });
  return ctx ?? fallback;
}
