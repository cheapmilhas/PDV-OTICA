"use client";
// src/components/prescriptions/diopter-keypad.tsx
//
// Teclado-calculadora (bottom-sheet) para dioptria em toque. O teclado decimal
// do iOS não tem tecla de menos → digitar miopia (negativo) é impossível.
// COMPONENTE CONTROLADO: tudo exibido deriva de `value` via formatDiopter().
// NÃO manter estado-espelho de magnitude/sinal — desincronizaria quando o pai
// troca `value` (ex.: editar receita existente).


import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { flipSign, formatDiopter, sanitizeSign } from "@/lib/diopter-input";

interface DiopterKeypadProps {
  open: boolean;
  value: string; // string controlada vinda do formulário
  field: "esf" | "cil" | "adicao";
  label: string; // ex. "OD · Esférico"
  onChange: (raw: string) => void;
  onClose: () => void;
}

/** Valores de dioptria mais comuns na prática de balcão (magnitude, sem sinal). */
const COMMON_CHIPS = ["0,25", "0,50", "1,00", "2,00", "3,00", "4,00"] as const;
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;
const KEY_CLASS =
  "flex min-h-11 min-w-11 items-center justify-center rounded-md border border-input bg-background text-lg font-medium transition-all duration-150 hover:bg-accent hover:text-accent-foreground active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Número atual do value controlado.
 * Vazio/só-espaços → 0 (stepar a partir do zero é legítimo).
 * Não-vazio mas inválido (ex.: "1,2,3") → NaN (o chamador deve tratar como no-op,
 * para NÃO substituir silenciosamente um valor legado malformado).
 */
function parseValue(value: string): number {
  const raw = sanitizeSign(value).trim();
  if (raw === "") return 0;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

/** Re-stringifica em pt-BR: no máx. 2 decimais, separador vírgula, "-" na frente. */
function stringify(n: number): string {
  if (n === 0) return "0";
  // toFixed(2) e remove zeros/vírgula à direita → "2,25", "3", "1,5".
  const fixed = n.toFixed(2).replace(/\.?0+$/, "");
  return fixed.replace(".", ",");
}

export function DiopterKeypad({
  open,
  value,
  field,
  label,
  onChange,
  onClose,
}: DiopterKeypadProps) {
  const showSign = field !== "adicao";
  const isNegative = sanitizeSign(value).startsWith("-");

  const appendChar = (char: string) => {
    onChange(sanitizeSign(value + char));
  };

  const handleComma = () => {
    // Separador único: se já há vírgula (ou ponto), pressionar vírgula é no-op.
    if (value.includes(",") || value.includes(".")) return;
    onChange(sanitizeSign(value + ","));
  };

  const handleBackspace = () => {
    onChange(value.slice(0, -1));
  };

  const handleStep = (delta: number) => {
    const base = parseValue(value);
    // Valor não-vazio e inválido → no-op (não sobrescreve valor legado malformado).
    if (Number.isNaN(base)) return;
    let next = base + delta;
    // Adição é sempre positiva (+0,50..+4,00): nunca deixar ficar negativa.
    if (field === "adicao") next = Math.max(0, next);
    onChange(stringify(next));
  };

  const handleChip = (magnitude: string) => {
    // Define a magnitude preservando o sinal atual.
    onChange(sanitizeSign((isNegative ? "-" : "") + magnitude));
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="p-4">
        <SheetHeader>
          <SheetTitle className="text-base">{label}</SheetTitle>
        </SheetHeader>

        {/* Visor: deriva 100% de value. */}
        <div
          data-testid="keypad-display"
          className="my-3 rounded-lg border bg-muted/40 px-4 py-3 text-center text-3xl font-semibold tabular-nums"
        >
          {formatDiopter(value)}
        </div>

        {/* Chips de valores comuns (mantêm o sinal atual). */}
        <div className="mb-3 flex flex-wrap gap-2">
          {COMMON_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => handleChip(chip)}
              className="min-h-11 rounded-full border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground active:scale-[0.98]"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Atalhos ±0,25. */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            data-testid="keypad-step-down"
            onClick={() => handleStep(-0.25)}
            className={KEY_CLASS}
          >
            −0,25
          </button>
          <button
            type="button"
            data-testid="keypad-step-up"
            onClick={() => handleStep(0.25)}
            className={KEY_CLASS}
          >
            +0,25
          </button>
        </div>

        {/* Teclado numérico. */}
        <div className="grid grid-cols-3 gap-2">
          {DIGITS.slice(0, 9).map((d) => (
            <button
              key={d}
              type="button"
              data-testid={`keypad-digit-${d}`}
              onClick={() => appendChar(d)}
              className={KEY_CLASS}
            >
              {d}
            </button>
          ))}

          {showSign ? (
            <button
              type="button"
              data-testid="keypad-sign"
              onClick={() => onChange(flipSign(value))}
              className={KEY_CLASS}
              aria-label="Alternar sinal"
            >
              ±
            </button>
          ) : (
            <span aria-hidden className="min-h-11" />
          )}

          <button
            type="button"
            data-testid="keypad-digit-0"
            onClick={() => appendChar("0")}
            className={KEY_CLASS}
          >
            0
          </button>

          <button
            type="button"
            data-testid="keypad-comma"
            onClick={handleComma}
            className={KEY_CLASS}
            aria-label="Vírgula decimal"
          >
            ,
          </button>
        </div>

        {/* Ações. */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            data-testid="keypad-backspace"
            onClick={handleBackspace}
            className={KEY_CLASS}
            aria-label="Apagar"
          >
            ⌫
          </button>
          <button
            type="button"
            data-testid="keypad-clear"
            onClick={() => onChange("")}
            className={`${KEY_CLASS} text-base`}
          >
            Limpar
          </button>
          <button
            type="button"
            data-testid="keypad-ok"
            onClick={onClose}
            className="flex min-h-11 items-center justify-center rounded-md bg-primary text-base font-medium text-primary-foreground transition-all duration-150 hover:bg-primary/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            OK
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
