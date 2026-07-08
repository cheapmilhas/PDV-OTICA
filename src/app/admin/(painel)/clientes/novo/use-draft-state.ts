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
  const [value, setValue] = useState<T>(() => read(key, initial));

  useEffect(() => {
    try {
      window.sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // storage cheio/indisponível — degrada para form normal (sem rascunho).
    }
  }, [key, value]);

  return [value, setValue];
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
