"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Rascunho do wizard de cadastro de cliente em sessionStorage.
 *
 * Motivação: o formulário tem ~30 campos em 4 etapas. Sair sem querer (voltar,
 * fechar aba, recarregar) apagava tudo. Agora cada campo persiste sob uma chave
 * única e é restaurado na montagem.
 *
 * sessionStorage (não localStorage): o rascunho vive só na aba/sessão do
 * navegador — não vaza dados de cadastro para outras sessões nem persiste
 * indefinidamente no disco. Credenciais (ex: senha do admin) NÃO usam este hook.
 */

const PREFIX = "admin:new-client-draft:";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Igual a useState, mas persiste o valor em sessionStorage sob `key`. */
export function useDraftState<T>(key: string, initial: T): [T, (v: T) => void] {
  // Hydration-safety: o primeiro render usa SEMPRE `initial` (igual ao SSR, que
  // não enxerga o sessionStorage). Ler o storage no inicializador do useState
  // divergiria do HTML do servidor e dispararia hydration mismatch. O rascunho
  // é aplicado só APÓS a montagem, no efeito de hidratação abaixo.
  const [value, setValue] = useState<T>(initial);
  // `hydrated` é useState (não useRef) DE PROPÓSITO: precisa virar true só no
  // PRÓXIMO render, não sincronicamente. Assim o efeito de escrita do primeiro
  // commit ainda vê `false` e NÃO grava o `initial` por cima do rascunho no
  // storage — o que apagaria o rascunho antes do hasDraft() do form lê-lo.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Hidrata uma única vez, na montagem: se há rascunho salvo, aplica-o.
    const stored = read(key, initial);
    if (stored !== initial) setValue(stored);
    setHydrated(true);
    // Só depende da montagem (key/initial estáveis por campo). Não reexecutar
    // a cada mudança de valor — isso reverteria o que o usuário digita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Não grava antes de hidratado: no primeiro commit `hydrated` ainda é false,
    // então o `initial` NÃO sobrescreve o rascunho no storage. Após a hidratação,
    // grava o valor correto (o rascunho, ou o que o usuário digitar depois).
    if (!hydrated) return;
    try {
      window.sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // storage cheio/indisponível — degrada para form normal (sem rascunho).
    }
  }, [hydrated, key, value]);

  return [value, setValue];
}

/**
 * Há rascunho salvo em ALGUMA das chaves informadas? Lê o sessionStorage
 * diretamente — use dentro de um efeito de montagem (nunca no render, para não
 * reintroduzir hydration mismatch). Uma chave conta como preenchida quando o
 * valor salvo existe e não é vazio/null/false.
 */
export function hasDraft(keys: readonly string[]): boolean {
  if (typeof window === "undefined") return false;
  return keys.some((k) => {
    const stored = read<unknown>(k, null);
    return stored !== null && stored !== "" && stored !== false;
  });
}

/** Chaves de rascunho conhecidas — usadas para limpar tudo após submeter. */
export function useClearDraft(keys: readonly string[]): () => void {
  // keys é estável (lista literal), mas guardamos em ref para não recriar o cb.
  const keysRef = useRef(keys);
  keysRef.current = keys;
  return useCallback(() => {
    try {
      for (const k of keysRef.current) {
        window.sessionStorage.removeItem(PREFIX + k);
      }
    } catch {
      // sem storage — nada a limpar.
    }
  }, []);
}
