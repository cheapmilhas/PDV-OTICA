const DEFAULT_RESEND_API_URL = "https://api.resend.com";

function getConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY environment variable is required");
  }

  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error("EMAIL_FROM environment variable is required");
  }

  return {
    apiKey,
    baseUrl: process.env.RESEND_API_URL || DEFAULT_RESEND_API_URL,
    from,
    replyTo: process.env.EMAIL_REPLY_TO || undefined,
  };
}

export interface ResendTag {
  name: string;
  value: string;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string | string[];
  idempotencyKey?: string;
  tags?: ResendTag[];
}

export interface SendEmailResponse {
  id: string;
}

export class ResendError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string
  ) {
    super(message);
    this.name = "ResendError";
  }
}

function parseErrorMessage(body: unknown, status: number): string {
  if (typeof body === "string" && body) return body;
  if (body && typeof body === "object") {
    const maybeMessage =
      (body as { message?: unknown }).message ||
      (body as { error?: { message?: unknown } }).error?.message ||
      (body as { name?: unknown }).name;
    if (typeof maybeMessage === "string" && maybeMessage) return maybeMessage;
  }
  return `Resend ${status}`;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResponse> {
  const { apiKey, baseUrl, from, replyTo } = getConfig();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "User-Agent": "pdv-otica/1.0",
  };

  if (input.idempotencyKey) {
    headers["Idempotency-Key"] = input.idempotencyKey.slice(0, 256);
  }

  const payload: Record<string, unknown> = {
    from: input.from || from,
    to: input.to,
    subject: input.subject,
    html: input.html,
  };

  if (input.text !== undefined) payload.text = input.text;
  const effectiveReplyTo = input.replyTo || replyTo;
  if (effectiveReplyTo) payload.reply_to = effectiveReplyTo;
  if (input.tags?.length) payload.tags = input.tags;

  const response = await fetch(`${baseUrl}/emails`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);

  if (!response.ok) {
    throw new ResendError(response.status, body, parseErrorMessage(body, response.status));
  }

  const id = (body as { id?: unknown })?.id;
  if (typeof id !== "string" || !id) {
    throw new ResendError(response.status, body, "Resend response did not include an email id");
  }

  return { id };
}
