import type { PrescriptionListItem } from "@/components/prescriptions/prescription-list";

export interface CustomerGroup {
  customerId: string;
  customerName: string;
  prescriptions: PrescriptionListItem[]; // ordenadas por issuedAt ASC
  latest: PrescriptionListItem;          // a de issuedAt mais novo (última do array)
  count: number;                          // page-scoped (ver spec)
}

function ms(d: string | Date): number {
  return (typeof d === "string" ? new Date(d) : d).getTime();
}

/**
 * Agrupa receitas por cliente (page-scoped — opera só sobre o array recebido).
 * - Receitas de cada grupo ordenadas por issuedAt ASC (evolução do grau).
 * - `latest` = última do array (issuedAt mais novo).
 * - Grupos ordenados pelo issuedAt mais recente DESC; empate por nome A→Z.
 * - Receitas sem customer.id são ignoradas (defensivo).
 */
export function groupByCustomer(items: PrescriptionListItem[]): CustomerGroup[] {
  const byId = new Map<string, PrescriptionListItem[]>();
  for (const p of items) {
    const id = p.customer?.id;
    if (!id) continue;
    const arr = byId.get(id) ?? [];
    arr.push(p);
    byId.set(id, arr);
  }

  const groups: CustomerGroup[] = [];
  for (const [customerId, arr] of byId) {
    const sorted = [...arr].sort((a, b) => ms(a.issuedAt) - ms(b.issuedAt));
    const latest = sorted[sorted.length - 1];
    groups.push({
      customerId,
      customerName: latest.customer?.name ?? "—",
      prescriptions: sorted,
      latest,
      count: sorted.length,
    });
  }

  groups.sort((a, b) => {
    const diff = ms(b.latest.issuedAt) - ms(a.latest.issuedAt);
    if (diff !== 0) return diff;
    return a.customerName.localeCompare(b.customerName);
  });

  return groups;
}
