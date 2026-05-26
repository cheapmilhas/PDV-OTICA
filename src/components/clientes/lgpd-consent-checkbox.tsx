"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";

export interface ConsentState {
  personalData: boolean;
  healthData: boolean;
  marketing: boolean;
}

interface Props {
  value: ConsentState;
  onChange: (value: ConsentState) => void;
  /** Se true, os 2 primeiros checkboxes são obrigatórios para prosseguir. */
  required?: boolean;
}

/**
 * Bloco de consentimento LGPD para usar no cadastro/edição de cliente.
 *
 * O resultado deve ser enviado ao back-end junto do cadastro, que chama
 * recordConsent() em src/lib/lgpd.ts.
 *
 * Conformidade: Art. 7º (bases legais) + Art. 11 (dados de saúde).
 */
export function LgpdConsentCheckbox({ value, onChange, required = true }: Props) {
  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
        Consentimento LGPD
      </p>

      <label className="flex items-start gap-3 text-sm">
        <Checkbox
          checked={value.personalData}
          onCheckedChange={(c) => onChange({ ...value, personalData: !!c })}
        />
        <span>
          Autorizo o tratamento dos meus <strong>dados pessoais</strong> (nome, contato,
          endereço, CPF) para a finalidade da relação comercial com a ótica.
          {required && <span className="text-red-600"> *</span>}
        </span>
      </label>

      <label className="flex items-start gap-3 text-sm">
        <Checkbox
          checked={value.healthData}
          onCheckedChange={(c) => onChange({ ...value, healthData: !!c })}
        />
        <span>
          Autorizo o tratamento da <strong>receita oftalmológica</strong> (dado de saúde,
          LGPD Art. 11) para confecção de lentes e atendimento ótico.
          {required && <span className="text-red-600"> *</span>}
        </span>
      </label>

      <label className="flex items-start gap-3 text-sm">
        <Checkbox
          checked={value.marketing}
          onCheckedChange={(c) => onChange({ ...value, marketing: !!c })}
        />
        <span>
          Quero receber <strong>comunicações promocionais</strong> (lembrete de troca de
          lente, ofertas, aniversário). Posso revogar a qualquer momento.
        </span>
      </label>

      <p className="text-xs text-zinc-600 dark:text-zinc-400 pt-2">
        Saiba mais em nossa{" "}
        <Link href="/privacidade" target="_blank" className="underline">
          Política de Privacidade
        </Link>
        .
      </p>
    </div>
  );
}

/** Hook helper para estado inicial. */
export function useConsentState(initial?: Partial<ConsentState>) {
  return useState<ConsentState>({
    personalData: initial?.personalData ?? false,
    healthData: initial?.healthData ?? false,
    marketing: initial?.marketing ?? false,
  });
}
