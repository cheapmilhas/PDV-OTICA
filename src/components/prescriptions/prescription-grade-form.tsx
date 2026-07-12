"use client";

import { Input } from "@/components/ui/input";
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

export function PrescriptionGradeForm({ value, onChange, disabled }: Props) {
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

  const result = validateGrade(value);

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
                  <Input
                    data-testid={`grade-${eye}-${c.key}`}
                    aria-label={`${eye === "od" ? "Olho direito" : "Olho esquerdo"} — ${c.label}`}
                    className="h-11 text-center text-base"
                    value={value[eye][c.key] ?? ""}
                    disabled={disabled}
                    inputMode={c.integer ? "numeric" : "decimal"}
                    placeholder={c.placeholder}
                    onChange={(e) => handleField(eye, c, e.target.value)}
                  />
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
                  <Input
                    data-testid={`grade-desktop-${eye}-${c.key}`}
                    className="h-9 text-center text-sm border-0 focus-visible:ring-1"
                    value={value[eye][c.key] ?? ""}
                    disabled={disabled}
                    inputMode={c.integer ? "numeric" : "decimal"}
                    placeholder={c.placeholder}
                    onChange={(e) => handleField(eye, c, e.target.value)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">Adição</label>
        <Input
          data-testid="grade-adicao"
          className="h-11 w-28 text-center text-base md:h-9 md:text-sm"
          value={value.adicao ?? ""}
          disabled={disabled}
          inputMode="decimal"
          placeholder="+0.00"
          onChange={(e) =>
            onChange({ od: value.od, oe: value.oe, adicao: sanitizeNumeric(e.target.value) })
          }
        />
      </div>

      {!result.ok && (
        <ul className="text-xs text-red-600 list-disc pl-4">
          {result.errors.map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
