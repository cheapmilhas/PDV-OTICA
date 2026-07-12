"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { DiopterKeypad } from "@/components/prescriptions/diopter-keypad";
import { useMediaQuery } from "@/hooks/use-media-query";
import { formatDiopter } from "@/lib/diopter-input";
import { validateGrade, type GradeInput, type EyeGrade } from "@/lib/prescription-grade-validation";

/**
 * Grade OD/OE de grau, extraída da OS para reúso (OS + Livro de Receitas).
 * Controlada por `{ od, oe, adicao }` — NÃO carrega campos de lente/olho-dominante
 * (esses ficam no parent). `onChange` emite só o patch `{od,oe,adicao}`; o parent
 * faz o merge preservando seus outros campos.
 *
 * Dois layouts compartilhando o MESMO estado (sem duplicar lógica):
 * - phone (< md): cartão por olho (OD depois OE), inputs grandes (44px) e
 *   tapáveis. Digitação LIVRE em todos os campos — eixo é 0–180 inteiro e
 *   exige exatidão (erro de eixo = lente errada); nada de stepper aqui.
 * - md+ (iPad/desktop): tabela OD/OE, que espelha o layout da receita em papel.
 *
 * Em dispositivos de TOQUE (celular E iPad — `(pointer: coarse)`), os campos de
 * dioptria (esf/cil/adição) viram um "button-visor" tapável que abre o
 * `DiopterKeypad` — o teclado decimal do iOS não tem tecla de menos, então
 * digitar miopia (negativa) direto no <input> é impossível. eixo/dnp/altura
 * seguem <input> sempre (inteiros / sem sinal). No mouse (não-toque) tudo
 * permanece como <input>. O gate é por PONTEIRO, não por largura de tela.
 */

export interface PrescriptionGradeValue {
  od: EyeGrade;
  oe: EyeGrade;
  adicao?: string;
}

interface Props {
  value: PrescriptionGradeValue;
  onChange: (patch: GradeInput) => void;
  disabled?: boolean;
}

// Mesma sanitização da OS (permite dígitos, vírgula, ponto, sinal).
const sanitizeNumeric = (v: string) => v.replace(/[^0-9.,\-+]/g, "");
const sanitizeInteger = (v: string) => v.replace(/[^0-9]/g, "");

const COLS: Array<{ key: keyof EyeGrade; label: string; integer?: boolean; placeholder: string }> = [
  { key: "esf", label: "Esférico", placeholder: "+0.00" },
  { key: "cil", label: "Cilíndrico", placeholder: "-0.00" },
  { key: "eixo", label: "Eixo", integer: true, placeholder: "0" },
  { key: "dnp", label: "DNP", placeholder: "00" },
  { key: "altura", label: "Altura", placeholder: "00" },
];

// Campos de dioptria que recebem o keypad no toque (têm sinal / são decimais).
const KEYPAD_COLS = new Set<keyof EyeGrade>(["esf", "cil"]);

type OpenKeypad =
  | { eye: "od" | "oe"; field: "esf" | "cil" }
  | { eye: "adicao"; field: "adicao" };

const eyeLabel = (eye: "od" | "oe") => (eye === "od" ? "Olho direito" : "Olho esquerdo");

export function PrescriptionGradeForm({ value, onChange, disabled }: Props) {
  const isTouch = useMediaQuery("(pointer: coarse)");
  const [openKeypad, setOpenKeypad] = useState<OpenKeypad | null>(null);

  const setEye = (eye: "od" | "oe", field: keyof EyeGrade, raw: string) => {
    onChange({
      od: value.od,
      oe: value.oe,
      adicao: value.adicao,
      [eye]: { ...value[eye], [field]: raw },
    });
  };

  const handleField = (eye: "od" | "oe", col: (typeof COLS)[number], raw: string) =>
    setEye(eye, col.key, col.integer ? sanitizeInteger(raw) : sanitizeNumeric(raw));

  const setAdicao = (raw: string) =>
    onChange({ od: value.od, oe: value.oe, adicao: sanitizeNumeric(raw) });

  // Roteia a emissão do keypad para o mesmo caminho de sanitização dos <input>.
  const emitFromKeypad = (raw: string) => {
    if (!openKeypad) return;
    if (openKeypad.eye === "adicao") {
      setAdicao(raw);
      return;
    }
    const col = COLS.find((c) => c.key === openKeypad.field)!;
    handleField(openKeypad.eye, col, raw);
  };

  const result = validateGrade(value);

  // Um campo de dioptria (esf/cil): <input> no mouse, button-visor no toque.
  const renderDioptriaField = (
    eye: "od" | "oe",
    c: (typeof COLS)[number],
    { testId, inputClass, buttonClass }: { testId: string; inputClass: string; buttonClass: string },
  ) => {
    const raw = value[eye][c.key] ?? "";
    const ariaLabel = `${eyeLabel(eye)} — ${c.label}`;
    if (isTouch && KEYPAD_COLS.has(c.key)) {
      return (
        <button
          type="button"
          role="button"
          data-testid={testId}
          aria-label={ariaLabel}
          className={buttonClass}
          disabled={disabled}
          onClick={() => setOpenKeypad({ eye, field: c.key as "esf" | "cil" })}
        >
          {raw ? formatDiopter(raw) : <span className="text-muted-foreground">{c.placeholder}</span>}
        </button>
      );
    }
    return (
      <Input
        data-testid={testId}
        aria-label={ariaLabel}
        className={inputClass}
        value={raw}
        disabled={disabled}
        inputMode={c.integer ? "numeric" : "decimal"}
        placeholder={c.placeholder}
        onChange={(e) => handleField(eye, c, e.target.value)}
      />
    );
  };

  const openLabel: string = openKeypad
    ? openKeypad.eye === "adicao"
      ? "Adição"
      : `${openKeypad.eye === "od" ? "OD" : "OE"} · ${
          openKeypad.field === "esf" ? "Esférico" : "Cilíndrico"
        }`
    : "";

  const openValue: string = openKeypad
    ? openKeypad.eye === "adicao"
      ? value.adicao ?? ""
      : value[openKeypad.eye][openKeypad.field] ?? ""
    : "";

  return (
    <div className="space-y-2">
      {/* ===== Phone (< md): cartão por olho ===== */}
      <div className="space-y-3 md:hidden">
        {(["od", "oe"] as const).map((eye) => (
          <div key={eye} className="rounded-lg border p-3">
            <p className="mb-2 text-sm font-bold">
              {eye === "od" ? "OD — Olho Direito" : "OE — Olho Esquerdo"}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {COLS.map((c) => (
                <label key={c.key} className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{c.label}</span>
                  {renderDioptriaField(eye, c, {
                    testId: `grade-${eye}-${c.key}`,
                    inputClass: "h-11 text-center text-base",
                    buttonClass:
                      "flex h-11 items-center justify-center rounded-md border border-input bg-background text-center text-base tabular-nums disabled:opacity-50",
                  })}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ===== md+ (iPad/desktop): tabela (espelha a receita em papel) ===== */}
      <table className="hidden w-full border-collapse text-sm md:table">
        <thead>
          <tr>
            <th className="border p-1.5 text-left font-semibold w-14">Olho</th>
            {COLS.map((c) => (
              <th key={c.key} className="border p-1.5 text-center font-semibold">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(["od", "oe"] as const).map((eye) => (
            <tr key={eye}>
              <td className="border p-1.5 font-bold bg-gray-50 text-center">
                {eye === "od" ? "OD" : "OE"}
              </td>
              {COLS.map((c) => (
                <td key={c.key} className="border p-0.5">
                  {renderDioptriaField(eye, c, {
                    testId: `grade-desktop-${eye}-${c.key}`,
                    inputClass: "h-9 text-center text-sm border-0 focus-visible:ring-1",
                    buttonClass:
                      "flex h-11 w-full items-center justify-center rounded-md text-center text-sm tabular-nums disabled:opacity-50",
                  })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">Adição</label>
        {isTouch ? (
          <button
            type="button"
            role="button"
            data-testid="grade-adicao"
            aria-label="Adição"
            className="flex h-11 w-28 items-center justify-center rounded-md border border-input bg-background text-center text-base tabular-nums disabled:opacity-50"
            disabled={disabled}
            onClick={() => setOpenKeypad({ eye: "adicao", field: "adicao" })}
          >
            {value.adicao ? (
              formatDiopter(value.adicao)
            ) : (
              <span className="text-muted-foreground">+0.00</span>
            )}
          </button>
        ) : (
          <Input
            data-testid="grade-adicao"
            aria-label="Adição"
            className="h-11 w-28 text-center text-base md:h-9 md:text-sm"
            value={value.adicao ?? ""}
            disabled={disabled}
            inputMode="decimal"
            placeholder="+0.00"
            onChange={(e) => setAdicao(e.target.value)}
          />
        )}
      </div>

      {!result.ok && (
        <ul className="text-xs text-red-600 list-disc pl-4">
          {result.errors.map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      )}

      {/* Um único keypad, dirigido por `openKeypad`. Sinal ausente para adição. */}
      <DiopterKeypad
        open={openKeypad !== null}
        value={openValue}
        field={openKeypad?.field ?? "esf"}
        label={openLabel}
        onChange={emitFromKeypad}
        onClose={() => setOpenKeypad(null)}
      />
    </div>
  );
}
