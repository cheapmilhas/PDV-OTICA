"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Input } from "./input"

/**
 * Mantém apenas dígitos, vírgula, ponto e um sinal opcional.
 * NÃO converte para número — a conversão real acontece no submit,
 * por um parser separado. Este componente é string-first.
 */
function sanitizeDecimal(raw: string): string {
  return raw.replace(/[^\d.,+-]/g, "")
}

interface DecimalInputProps
  extends Omit<
    React.ComponentProps<typeof Input>,
    "type" | "inputMode" | "onChange" | "value"
  > {
  /** String bruta controlada (ex.: "12,50"). */
  value: string
  onValueChange: (raw: string) => void
  /** Preset visual: prefixo "R$". Não altera a string emitida. */
  money?: boolean
}

/**
 * Input de decimal/dinheiro string-first para mobile.
 *
 * Usa `type="text"` + `inputMode="decimal"` — NUNCA `type="number"`, que no iOS
 * descarta a vírgula decimal pt-BR e não oferece forma de digitá-la.
 */
const DecimalInput = React.forwardRef<HTMLInputElement, DecimalInputProps>(
  ({ value, onValueChange, money, className, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onValueChange(sanitizeDecimal(e.target.value))
    }

    const input = (
      <Input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={handleChange}
        className={cn(money && "pl-9", className)}
        ref={ref}
        {...props}
      />
    )

    if (!money) {
      return input
    }

    return (
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
        >
          R$
        </span>
        {input}
      </div>
    )
  }
)
DecimalInput.displayName = "DecimalInput"

export { DecimalInput, sanitizeDecimal }
