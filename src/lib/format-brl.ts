/** Formata centavos como moeda BRL pt-BR (ex.: 14990 → "R$ 149,90"). */
export function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Data curta pt-BR (timeZone America/Fortaleza). `null` → "". */
export function dateBR(d: Date | null): string {
  return d
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Fortaleza" }).format(d)
    : "";
}
