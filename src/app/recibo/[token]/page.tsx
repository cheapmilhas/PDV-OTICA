import { jwtVerify } from "jose";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { saleDisplayNumber } from "@/lib/sale-number";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
if (!authSecret) throw new Error("AUTH_SECRET is required");
const SECRET = new TextEncoder().encode(authSecret);

interface TokenPayload {
  saleId: string;
  companyId: string;
  type: "receipt";
}

async function decode(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.type !== "receipt" || !payload.saleId || !payload.companyId) {
      return null;
    }
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

function brl(n: number | { toString(): string } | null | undefined) {
  const v = typeof n === "number" ? n : Number(n ?? 0);
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Dinheiro",
  PIX: "PIX",
  DEBIT_CARD: "Cartão débito",
  CREDIT_CARD: "Cartão crédito",
  CREDIT: "Crediário",
  BANK_TRANSFER: "Transferência",
  CHECK: "Cheque",
  OTHER: "Outro",
};

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payload = await decode(token);
  if (!payload) notFound();

  const sale = await prisma.sale.findFirst({
    where: { id: payload.saleId, companyId: payload.companyId },
    include: {
      customer: { select: { name: true, cpf: true } },
      company: { select: { name: true, phone: true, cnpj: true } },
      branch: { select: { name: true, address: true, city: true, state: true } },
      items: {
        include: {
          product: { select: { name: true, sku: true } },
        },
      },
      payments: true,
    },
  });

  if (!sale) notFound();

  const total = Number(sale.total);
  const discount = Number(sale.discountTotal ?? 0);
  const subtotal = Number(sale.subtotal ?? total + discount);
  const issuedAt = new Date(sale.createdAt).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <div className="min-h-screen bg-slate-50 py-8 print:bg-white print:py-0">
      <div className="mx-auto max-w-2xl bg-white p-8 shadow print:shadow-none print:p-4">
        <header className="border-b border-slate-200 pb-4">
          <h1 className="text-xl font-semibold">{sale.company.name}</h1>
          {sale.company.cnpj && (
            <p className="text-sm text-slate-600">CNPJ: {sale.company.cnpj}</p>
          )}
          {sale.branch && (
            <p className="text-sm text-slate-600">
              {sale.branch.name}
              {sale.branch.address ? ` — ${sale.branch.address}` : ""}
              {sale.branch.city ? `, ${sale.branch.city}` : ""}
              {sale.branch.state ? `/${sale.branch.state}` : ""}
            </p>
          )}
          {sale.company.phone && (
            <p className="text-sm text-slate-600">Tel: {sale.company.phone}</p>
          )}
        </header>

        <section className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Recibo de venda</h2>
            <p className="text-sm text-slate-600">
              {saleDisplayNumber(sale)} · Emitido em {issuedAt}
            </p>
          </div>
          {sale.customer && (
            <div className="text-right">
              <p className="text-sm font-medium">{sale.customer.name}</p>
              {sale.customer.cpf && (
                <p className="text-xs text-slate-600">CPF: {sale.customer.cpf}</p>
              )}
            </div>
          )}
        </section>

        <section className="mt-6">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Produto</th>
                <th className="py-2 text-right">Qtd</th>
                <th className="py-2 text-right">Preço</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item) => {
                const qty = Number(item.qty);
                const unit = Number(item.unitPrice);
                const lineTotal = Number(item.lineTotal ?? qty * unit);
                return (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="py-2">
                      <div>{item.product?.name ?? "Item"}</div>
                      {item.product?.sku && (
                        <div className="text-xs text-slate-500">{item.product.sku}</div>
                      )}
                    </td>
                    <td className="py-2 text-right">{qty}</td>
                    <td className="py-2 text-right">{brl(unit)}</td>
                    <td className="py-2 text-right">{brl(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="mt-6 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Subtotal</span>
            <span>{brl(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Desconto</span>
              <span>- {brl(discount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
            <span>Total</span>
            <span>{brl(total)}</span>
          </div>
        </section>

        {sale.payments.length > 0 && (
          <section className="mt-6">
            <h3 className="mb-2 text-sm font-medium text-slate-700">Pagamento</h3>
            <ul className="space-y-1 text-sm">
              {sale.payments.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>{PAYMENT_LABEL[p.method] ?? p.method}</span>
                  <span>{brl(p.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-8 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
          <p>Este recibo é um demonstrativo de venda — não substitui documento fiscal.</p>
          <p className="mt-1">Link válido por 7 dias a partir da emissão.</p>
        </footer>

        <div className="mt-6 flex justify-center print:hidden">
          <PrintButton />
        </div>
      </div>
    </div>
  );
}
