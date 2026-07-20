/**
 * Cliente HTTP tipado para a API do Asaas.
 *
 * Documentação: https://docs.asaas.com/
 *
 * Env vars:
 *   ASAAS_API_KEY        — chave da API (sandbox: $aact_test_*, produção: $aact_prod_*)
 *   ASAAS_API_URL        — opcional, default depende do env:
 *                          sandbox: https://api-sandbox.asaas.com/v3
 *                          prod:    https://api.asaas.com/v3
 *   ASAAS_WEBHOOK_TOKEN  — token compartilhado para validar payload do webhook
 */

const SANDBOX_URL = "https://api-sandbox.asaas.com/v3";
const PROD_URL = "https://api.asaas.com/v3";

function getConfig() {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) {
    throw new Error("ASAAS_API_KEY environment variable is required");
  }
  const isProd = apiKey.startsWith("$aact_prod_");
  const baseUrl = process.env.ASAAS_API_URL || (isProd ? PROD_URL : SANDBOX_URL);
  return { apiKey, baseUrl, isProd };
}

export interface AsaasCustomer {
  id: string;
  name: string;
  email: string;
  cpfCnpj: string;
  mobilePhone?: string;
  externalReference?: string;
  notificationDisabled?: boolean;
}

export interface AsaasCustomerInput {
  name: string;
  email: string;
  cpfCnpj: string;
  mobilePhone?: string;
  externalReference?: string;
  notificationDisabled?: boolean;
}

export type AsaasBillingType = "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED";

export interface AsaasCreditCard {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
}

export interface AsaasCreditCardHolder {
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  phone: string;
  mobilePhone?: string;
}

export interface AsaasSubscriptionInput {
  customer: string;
  billingType: AsaasBillingType;
  nextDueDate: string; // YYYY-MM-DD
  value: number;
  cycle: "MONTHLY" | "YEARLY";
  description?: string;
  externalReference?: string;
  endDate?: string;
  maxPayments?: number;
  creditCard?: AsaasCreditCard;
  creditCardHolderInfo?: AsaasCreditCardHolder;
  remoteIp?: string;
}

export interface AsaasSubscriptionUpdateInput {
  value?: number;            // reais
  cycle?: "MONTHLY" | "YEARLY";
  nextDueDate?: string;      // YYYY-MM-DD
  description?: string;
}
// Nota: o PUT /subscriptions/{id} do Asaas aplica o novo valor às cobranças
// FUTURAS (próxima fatura em diante). Cobranças PENDENTES já geradas mantêm o
// valor antigo — coerente com a decisão "novo valor vale na próxima fatura"
// (sem proration retroativo).

export interface AsaasSubscription {
  id: string;
  customer: string;
  status: "ACTIVE" | "EXPIRED" | "INACTIVE";
  nextDueDate: string;
  value: number;
  cycle: "MONTHLY" | "YEARLY";
  billingType: AsaasBillingType;
  description?: string;
  externalReference?: string;
}

export interface AsaasPayment {
  id: string;
  customer: string;
  subscription?: string;
  value: number;
  netValue: number;
  status:
    | "PENDING"
    | "RECEIVED"
    | "CONFIRMED"
    | "OVERDUE"
    | "REFUNDED"
    | "RECEIVED_IN_CASH"
    | "REFUND_REQUESTED"
    | "CHARGEBACK_REQUESTED"
    | "CHARGEBACK_DISPUTE"
    | "AWAITING_CHARGEBACK_REVERSAL"
    | "DUNNING_REQUESTED"
    | "DUNNING_RECEIVED"
    | "AWAITING_RISK_ANALYSIS";
  billingType: AsaasBillingType;
  dueDate: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  pixQrCodeId?: string;
  externalReference?: string;
}

export interface AsaasPaymentListFilters {
  customer?: string;
  subscription?: string;
  status?: AsaasPayment["status"];
  offset?: number;
  limit?: number;
}

export interface AsaasPaymentListResult {
  data: AsaasPayment[];
  totalCount: number;
  hasMore: boolean;
  limit: number;
  offset: number;
}

export interface AsaasPaymentCreateInput {
  customer: string;
  billingType: AsaasBillingType;
  value: number; // reais
  dueDate: string; // YYYY-MM-DD
  description?: string;
  externalReference?: string;
  notificationDisabled?: boolean;
}

class AsaasError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "AsaasError";
  }
}

async function asaasFetch<T>(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {},
): Promise<T> {
  const { apiKey, baseUrl } = getConfig();
  const { idempotencyKey, ...rest } = init;

  const headers: Record<string, string> = {
    "access_token": apiKey,
    "Content-Type": "application/json",
    "User-Agent": "pdv-otica/1.0",
    ...((rest.headers as Record<string, string>) ?? {}),
  };
  if (idempotencyKey) headers["asaas-idempotency-key"] = idempotencyKey;

  const res = await fetch(`${baseUrl}${path}`, { ...rest, headers });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const errMsg =
      (body as { errors?: { description?: string }[] })?.errors?.[0]
        ?.description ||
      (typeof body === "string" ? body : `Asaas ${res.status}`);
    throw new AsaasError(res.status, body, errMsg);
  }

  return body as T;
}

export const asaas = {
  customers: {
    async create(input: AsaasCustomerInput): Promise<AsaasCustomer> {
      return asaasFetch<AsaasCustomer>("/customers", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    async get(id: string): Promise<AsaasCustomer> {
      return asaasFetch<AsaasCustomer>(`/customers/${id}`);
    },
    async update(
      id: string,
      input: Partial<AsaasCustomerInput>,
    ): Promise<AsaasCustomer> {
      return asaasFetch<AsaasCustomer>(`/customers/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      });
    },
    async findByCpfCnpj(cpfCnpj: string): Promise<AsaasCustomer | null> {
      const result = await asaasFetch<{ data: AsaasCustomer[] }>(
        `/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}`,
      );
      return result.data?.[0] ?? null;
    },
  },

  subscriptions: {
    async create(input: AsaasSubscriptionInput): Promise<AsaasSubscription> {
      return asaasFetch<AsaasSubscription>("/subscriptions", {
        method: "POST",
        body: JSON.stringify(input),
        idempotencyKey: input.externalReference,
      });
    },
    async get(id: string): Promise<AsaasSubscription> {
      return asaasFetch<AsaasSubscription>(`/subscriptions/${id}`);
    },
    async update(
      id: string,
      input: AsaasSubscriptionUpdateInput,
      idempotencyKey?: string,
      signal?: AbortSignal,
    ): Promise<AsaasSubscription> {
      return asaasFetch<AsaasSubscription>(`/subscriptions/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
        idempotencyKey,
        signal,
      });
    },
    async cancel(id: string): Promise<{ deleted: boolean; id: string }> {
      return asaasFetch<{ deleted: boolean; id: string }>(
        `/subscriptions/${id}`,
        { method: "DELETE" },
      );
    },
  },

  payments: {
    async list(
      filters: AsaasPaymentListFilters = {},
    ): Promise<AsaasPaymentListResult> {
      const params = new URLSearchParams();
      if (filters.customer) params.set("customer", filters.customer);
      if (filters.subscription) params.set("subscription", filters.subscription);
      if (filters.status) params.set("status", filters.status);
      params.set("limit", String(filters.limit ?? 100));
      params.set("offset", String(filters.offset ?? 0));
      return asaasFetch<AsaasPaymentListResult>(`/payments?${params.toString()}`);
    },
    async create(
      input: AsaasPaymentCreateInput,
      idempotencyKey?: string,
    ): Promise<AsaasPayment> {
      return asaasFetch<AsaasPayment>("/payments", {
        method: "POST",
        body: JSON.stringify(input),
        idempotencyKey,
      });
    },
    async get(id: string): Promise<AsaasPayment> {
      return asaasFetch<AsaasPayment>(`/payments/${id}`);
    },
    async pixQrCode(
      id: string,
    ): Promise<{ encodedImage: string; payload: string; expirationDate: string }> {
      return asaasFetch(`/payments/${id}/pixQrCode`);
    },
  },

  /** Valida o token compartilhado enviado pelo Asaas no header do webhook. */
  verifyWebhookToken(receivedToken: string | null): boolean {
    const expected = process.env.ASAAS_WEBHOOK_TOKEN;
    if (!expected) {
      // Sem token configurado, recusa por segurança
      return false;
    }
    if (!receivedToken) return false;
    // Comparação constante (evita timing attack)
    if (receivedToken.length !== expected.length) return false;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
      mismatch |= expected.charCodeAt(i) ^ receivedToken.charCodeAt(i);
    }
    return mismatch === 0;
  },
};

export { AsaasError };
