"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  analyzeLens,
  type FrameSize,
  type LensAnalysis,
} from "@/lib/lens-optics";
import {
  type EyeGrau,
  EMPTY_EYE,
  toNum,
  toEyePower,
  hasGrau,
} from "./eye-power";

const AI_DEGRADATION =
  "Não foi possível gerar a explicação agora. Os dados acima (índice e espessura) continuam válidos.";

/**
 * Traduz o motivo (seguro) devolvido pelo backend numa mensagem acionável para
 * o vendedor. O motor (índice/espessura) continua sempre válido — por isso toda
 * mensagem reforça isso. Fallback = genérica.
 */
const REASON_MESSAGE: Record<string, string> = {
  no_credit:
    "A IA está temporariamente sem saldo na conta. Avise o suporte. Os dados acima (índice e espessura) continuam válidos.",
  no_key:
    "A IA ainda não foi configurada para esta ótica. Avise o suporte. Os dados acima (índice e espessura) continuam válidos.",
  invalid_key:
    "A chave de acesso da IA precisa ser atualizada. Avise o suporte. Os dados acima (índice e espessura) continuam válidos.",
  generic: AI_DEGRADATION,
};

/**
 * Núcleo reutilizável do Assistente de Lentes. Diferente do painel antigo (que
 * RECEBIA od/oe por prop), este hook é DONO da receita: o vendedor digita os
 * valores no próprio widget. Roda o motor óptico determinístico, gerencia a
 * explicação opcional da IA (com degradação idêntica ao painel), limpa a IA
 * quando os dados mudam, e expõe reset + lastEditedAt para o expiry de 10 min.
 */
export interface UseLensAdvisor {
  od: EyeGrau;
  oe: EyeGrau;
  lensWidthMm: string;
  bridgeMm: string;
  setOdField: (field: keyof EyeGrau, value: string) => void;
  setOeField: (field: keyof EyeGrau, value: string) => void;
  setLensWidthMm: (v: string) => void;
  setBridgeMm: (v: string) => void;
  analysis: LensAnalysis | null;
  anyGrau: boolean;
  odHasGrau: boolean;
  oeHasGrau: boolean;
  disclaimer: string | null;
  aiText: string | null;
  aiLoading: boolean;
  aiError: string | null;
  explain: () => Promise<void>;
  reset: () => void;
  lastEditedAt: number | null;
}

export function useLensAdvisor(): UseLensAdvisor {
  const [od, setOd] = useState<EyeGrau>(EMPTY_EYE);
  const [oe, setOe] = useState<EyeGrau>(EMPTY_EYE);
  const [lensWidthMm, setLensWidthMmState] = useState("");
  const [bridgeMm, setBridgeMmState] = useState("");
  const [lastEditedAt, setLastEditedAt] = useState<number | null>(null);

  const [aiText, setAiText] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const touch = useCallback(() => setLastEditedAt(Date.now()), []);

  const setOdField = useCallback(
    (field: keyof EyeGrau, value: string) => {
      setOd((cur) => ({ ...cur, [field]: value }));
      touch();
    },
    [touch],
  );

  const setOeField = useCallback(
    (field: keyof EyeGrau, value: string) => {
      setOe((cur) => ({ ...cur, [field]: value }));
      touch();
    },
    [touch],
  );

  const setLensWidthMm = useCallback(
    (v: string) => {
      setLensWidthMmState(v);
      touch();
    },
    [touch],
  );

  const setBridgeMm = useCallback(
    (v: string) => {
      setBridgeMmState(v);
      touch();
    },
    [touch],
  );

  const odHasGrau = hasGrau(od);
  const oeHasGrau = hasGrau(oe);
  const anyGrau = odHasGrau || oeHasGrau;

  const analysis = useMemo(() => {
    if (!anyGrau) return null;
    const lw = toNum(lensWidthMm);
    const br = toNum(bridgeMm);
    const frame: FrameSize | undefined =
      !Number.isNaN(lw) && !Number.isNaN(br)
        ? { lensWidthMm: lw, bridgeMm: br }
        : undefined;
    // Se um olho não tiver grau, usa 0/0 (não invalida; o motor trata 0 como sem espessura).
    return analyzeLens(
      {
        od: odHasGrau ? toEyePower(od) : { sph: 0, cyl: 0 },
        oe: oeHasGrau ? toEyePower(oe) : { sph: 0, cyl: 0 },
      },
      frame,
    );
  }, [anyGrau, odHasGrau, oeHasGrau, od, oe, lensWidthMm, bridgeMm]);

  // disclaimer é uma string constante; basta pegar a do primeiro olho que tiver espessura.
  const disclaimer = analysis?.od.thickness.thicknessMm
    ? analysis.od.thickness.disclaimer
    : analysis?.oe.thickness.thicknessMm
      ? analysis.oe.thickness.disclaimer
      : null;

  // Limpa a explicação da IA quando o grau/armação muda — ela foi gerada para os
  // valores anteriores e não pode ficar contradizendo o motor recalculado.
  useEffect(() => {
    setAiText(null);
    setAiError(null);
  }, [od, oe, lensWidthMm, bridgeMm]);

  const explain = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    // Serializa o MESMO od/oe/frame que o memo alimenta no motor.
    const lw = toNum(lensWidthMm);
    const br = toNum(bridgeMm);
    const frame =
      Number.isFinite(lw) && Number.isFinite(br)
        ? { lensWidthMm: lw, bridgeMm: br }
        : undefined;
    const odPower = odHasGrau ? toEyePower(od) : { sph: 0, cyl: 0 };
    const oePower = oeHasGrau ? toEyePower(oe) : { sph: 0, cyl: 0 };
    try {
      const res = await fetch("/api/company/lens-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ od: odPower, oe: oePower, frame }),
      });
      if (!res.ok) {
        // O backend já manda um motivo específico e seguro (ex.: cota mensal
        // atingida, IA desligada). Mostra-o em vez da frase genérica.
        let backendMsg: string | null = null;
        try {
          const errJson = await res.json();
          const m: unknown = errJson?.error?.message;
          if (typeof m === "string" && m.trim() !== "") backendMsg = m.trim();
        } catch {
          // corpo não-JSON — cai no genérico
        }
        setAiError(backendMsg ?? AI_DEGRADATION);
        return;
      }
      const json = await res.json();
      const advice: unknown = json?.data?.advice;
      const aiUnavailable: boolean = json?.data?.aiUnavailable === true;
      const reason: unknown = json?.data?.aiUnavailableReason;
      if (typeof advice === "string" && advice.trim() !== "" && !aiUnavailable) {
        setAiText(advice);
      } else {
        // Degradação graciosa (sem saldo / chave / etc.): mostra a mensagem
        // acionável correspondente ao motivo, com fallback genérico.
        const key = typeof reason === "string" ? reason : "generic";
        setAiError(REASON_MESSAGE[key] ?? AI_DEGRADATION);
      }
    } catch {
      setAiError(AI_DEGRADATION);
    } finally {
      setAiLoading(false);
    }
  }, [od, oe, odHasGrau, oeHasGrau, lensWidthMm, bridgeMm]);

  const reset = useCallback(() => {
    setOd(EMPTY_EYE);
    setOe(EMPTY_EYE);
    setLensWidthMmState("");
    setBridgeMmState("");
    setAiText(null);
    setAiError(null);
    setLastEditedAt(null);
  }, []);

  return {
    od,
    oe,
    lensWidthMm,
    bridgeMm,
    setOdField,
    setOeField,
    setLensWidthMm,
    setBridgeMm,
    analysis,
    anyGrau,
    odHasGrau,
    oeHasGrau,
    disclaimer,
    aiText,
    aiLoading,
    aiError,
    explain,
    reset,
    lastEditedAt,
  };
}
