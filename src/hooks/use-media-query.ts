"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Breakpoints (px) — espelham os tokens de `screens` em tailwind.config.js.
 * Fonte única de verdade para JS e CSS concordarem sobre o que é "mobile".
 */
export const BREAKPOINTS = {
  xs: 475,
  sm: 640,
  md: 768,
  tab: 834, // iPad portrait real → resolve para layout tablet, não phone
  lg: 1024,
  xl: 1280,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

const noopSubscribe = () => () => {};

/**
 * SSR-safe media query hook.
 *
 * Usa `useSyncExternalStore` para que servidor e primeiro paint do cliente
 * concordem (getServerSnapshot === false), evitando hydration mismatch — a
 * raiz do flash que quebrava layouts ramificados no hook antigo (`useState(false)`).
 *
 * O snapshot do cliente lê `window.matchMedia` de forma síncrona, então o valor
 * já está correto na hidratação em vez de "false → flip no useEffect".
 */
export function useMediaQuery(query: string): boolean {
  // Um único MediaQueryList por query, estável entre renders — evita
  // re-subscribe desnecessário e não recria a lista a cada getSnapshot.
  const media = useMemo(() => {
    if (typeof window === "undefined") return null;
    return window.matchMedia(query);
  }, [query]);

  const subscribe = useCallback(
    (callback: () => void) => {
      if (!media) return () => {};
      media.addEventListener("change", callback);
      return () => media.removeEventListener("change", callback);
    },
    [media],
  );

  const getSnapshot = useCallback(() => media?.matches ?? false, [media]);

  const getServerSnapshot = () => false;

  return useSyncExternalStore(
    media ? subscribe : noopSubscribe,
    getSnapshot,
    getServerSnapshot,
  );
}

// -0.02px fecha o gap de viewports fracionários (ex.: 767.5px com zoom/DPR)
// entre um `max-width` e o `min-width` seguinte. Convenção do Bootstrap.
const BELOW = (px: number) => `(max-width: ${px - 0.02}px)`;

/** true abaixo de `md` (768px) — iPhone e telas estreitas. */
export function useIsMobile(): boolean {
  return useMediaQuery(BELOW(BREAKPOINTS.md));
}

/** true no range de tablet: `md` (768) até abaixo de `lg` (1024) — iPad portrait. */
export function useIsTablet(): boolean {
  return useMediaQuery(
    `(min-width: ${BREAKPOINTS.md}px) and ${BELOW(BREAKPOINTS.lg)}`,
  );
}

/** true em `lg` (1024px) e acima — desktop e iPad landscape. */
export function useIsDesktop(): boolean {
  return useMediaQuery(`(min-width: ${BREAKPOINTS.lg}px)`);
}
