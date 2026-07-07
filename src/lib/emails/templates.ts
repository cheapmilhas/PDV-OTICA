import { z } from "zod";
import { escapeHtml } from "@/lib/escape-html";
import { renderSaasEmailLayout } from "@/lib/emails/saas-email-layout";

export interface RenderedEmail {
  html: string;
  text: string;
}

const inviteEmailSchema = z.object({
  name: z.string().min(1),
  companyName: z.string().min(1),
  activationUrl: z.string().url(),
  expiresAt: z.string().optional(),
});

function formatExpiration(value?: string): string {
  if (!value) return "7 dias";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "7 dias";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Fortaleza",
  }).format(date);
}

function renderInviteEmail(data: unknown): RenderedEmail {
  const parsed = inviteEmailSchema.parse(data);
  const name = escapeHtml(parsed.name);
  const companyName = escapeHtml(parsed.companyName);
  const activationUrl = escapeHtml(parsed.activationUrl);
  const expiresAt = escapeHtml(formatExpiration(parsed.expiresAt));

  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ative sua conta no PDV Ótica</title>
  </head>
  <body style="margin:0;background:#f6f7fb;color:#111827;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7fb;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 8px;">
                <p style="margin:0 0 10px;color:#2563eb;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;">PDV Ótica</p>
                <h1 style="margin:0;color:#111827;font-size:24px;line-height:1.25;">Bem-vindo(a), ${name}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 4px;color:#374151;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 16px;">Sua conta da ${companyName} foi criada. Para começar a usar o sistema, ative seu acesso pelo botão abaixo.</p>
                <p style="margin:0 0 22px;">Este convite expira em <strong>${expiresAt}</strong>.</p>
                <p style="margin:0 0 26px;">
                  <a href="${activationUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;padding:12px 18px;font-weight:700;">Ativar minha conta</a>
                </p>
                <p style="margin:0;color:#6b7280;font-size:13px;">Se o botão não abrir, copie e cole este link no navegador:<br /><a href="${activationUrl}" style="color:#2563eb;word-break:break-all;">${activationUrl}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 28px 28px;color:#6b7280;font-size:12px;line-height:1.5;">
                Se você não esperava este convite, ignore este email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `Bem-vindo(a), ${parsed.name}`,
    "",
    `Sua conta da ${parsed.companyName} foi criada.`,
    `Ative seu acesso: ${parsed.activationUrl}`,
    `Este convite expira em ${formatExpiration(parsed.expiresAt)}.`,
    "",
    "Se voce nao esperava este convite, ignore este email.",
  ].join("\n");

  return { html, text };
}

// ─── SaaS templates ───────────────────────────────────────────────────────────

const welcomeSchema = z.object({ name: z.string().min(1), loginUrl: z.string().url() });
function renderSaasWelcome(data: unknown): RenderedEmail {
  const p = welcomeSchema.parse(data);
  // `name` vai no campo `heading`, que o layout JÁ escapa — passar cru (não
  // pré-escapar, senão fica duplo: "João & Cia" viraria "João &amp;amp; Cia").
  const bodyHtml = `<p style="margin:0 0 16px;">Sua conta no Vis está ativa. A partir de agora você tem o controle completo da sua ótica em um só lugar — vendas, ordens de serviço, estoque e financeiro.</p>
<p style="margin:0 0 22px;">Clique abaixo para começar.</p>`;
  const html = renderSaasEmailLayout({
    previewTitle: "Bem-vindo ao Vis",
    heading: `Bem-vindo(a), ${p.name}`,
    bodyHtml,
    cta: { label: "Acessar o sistema", url: p.loginUrl },
  });
  const text = [`Bem-vindo(a), ${p.name}`, "", "Sua conta no Vis está ativa.", `Acesse: ${p.loginUrl}`].join("\n");
  return { html, text };
}

const trialEndingSchema = z.object({
  name: z.string().min(1),
  daysLeft: z.number().int().nonnegative(),
  subscribeUrl: z.string().url(),
});
function renderSaasTrialEnding(data: unknown): RenderedEmail {
  const p = trialEndingSchema.parse(data);
  const bodyHtml = `<p style="margin:0 0 16px;">Seu período de teste no Vis termina em <strong>${p.daysLeft} dia(s)</strong>.</p>
<p style="margin:0 0 22px;">Assine agora para continuar usando todos os recursos sem interrupção.</p>`;
  const html = renderSaasEmailLayout({
    previewTitle: "Seu teste está acabando",
    heading: `${p.name}, seu teste está acabando`,
    bodyHtml,
    cta: { label: "Assinar agora", url: p.subscribeUrl },
  });
  const text = [`${p.name}, seu teste termina em ${p.daysLeft} dia(s).`, "", `Assine agora: ${p.subscribeUrl}`].join("\n");
  return { html, text };
}

const trialExpiredSchema = z.object({ name: z.string().min(1), subscribeUrl: z.string().url() });
function renderSaasTrialExpired(data: unknown): RenderedEmail {
  const p = trialExpiredSchema.parse(data);
  const bodyHtml = `<p style="margin:0 0 16px;">Seu período de teste no Vis chegou ao fim.</p>
<p style="margin:0 0 22px;">Para continuar usando o sistema, escolha um plano e ative sua assinatura agora.</p>`;
  const html = renderSaasEmailLayout({
    previewTitle: "Seu teste expirou",
    heading: `${p.name}, seu teste expirou`,
    bodyHtml,
    cta: { label: "Assinar agora", url: p.subscribeUrl },
  });
  const text = [`${p.name}, seu período de teste expirou.`, "", `Assine agora: ${p.subscribeUrl}`].join("\n");
  return { html, text };
}

const invoiceOverdueSchema = z.object({
  name: z.string().min(1),
  daysOverdue: z.number().int().nonnegative(),
  payUrl: z.string().url(),
});
function renderSaasInvoiceOverdue(data: unknown): RenderedEmail {
  const p = invoiceOverdueSchema.parse(data);
  const bodyHtml = `<p style="margin:0 0 16px;">Identificamos um atraso de <strong>${p.daysOverdue} dia(s)</strong> no pagamento da sua assinatura Vis.</p>
<p style="margin:0 0 22px;">Regularize agora para manter seu acesso ativo e evitar a suspensão.</p>`;
  const html = renderSaasEmailLayout({
    previewTitle: "Pagamento em atraso",
    heading: `${p.name}, seu pagamento está em atraso`,
    bodyHtml,
    cta: { label: "Pagar agora", url: p.payUrl },
  });
  const text = [`${p.name}, seu pagamento está em atraso (${p.daysOverdue} dia(s)).`, "", `Regularize: ${p.payUrl}`].join("\n");
  return { html, text };
}

const paymentConfirmedSchema = z.object({ name: z.string().min(1), amountLabel: z.string().min(1) });
function renderSaasPaymentConfirmed(data: unknown): RenderedEmail {
  const p = paymentConfirmedSchema.parse(data);
  // `amount` entra no bodyHtml (inserido cru pelo layout) → escapar aqui.
  // `name` vai no `heading` (layout escapa) → passar cru.
  const amount = escapeHtml(p.amountLabel);
  const bodyHtml = `<p style="margin:0 0 16px;">Recebemos seu pagamento de <strong>${amount}</strong> referente à sua assinatura Vis.</p>
<p style="margin:0 0 22px;">Obrigado por continuar com a gente. Seu acesso segue ativo normalmente.</p>`;
  const html = renderSaasEmailLayout({
    previewTitle: "Pagamento confirmado",
    heading: `${p.name}, pagamento confirmado`,
    bodyHtml,
  });
  const text = [`${p.name}, seu pagamento de ${p.amountLabel} foi confirmado.`, "", "Obrigado! Seu acesso segue ativo."].join("\n");
  return { html, text };
}

const subscriptionSuspendedSchema = z.object({ name: z.string().min(1), payUrl: z.string().url() });
function renderSaasSubscriptionSuspended(data: unknown): RenderedEmail {
  const p = subscriptionSuspendedSchema.parse(data);
  const bodyHtml = `<p style="margin:0 0 16px;">Sua assinatura Vis foi <strong>suspensa</strong> por falta de pagamento.</p>
<p style="margin:0 0 22px;">Regularize seu pagamento para reativar o acesso imediatamente.</p>`;
  const html = renderSaasEmailLayout({
    previewTitle: "Assinatura suspensa",
    heading: `${p.name}, sua assinatura foi suspensa`,
    bodyHtml,
    cta: { label: "Regularizar agora", url: p.payUrl },
  });
  const text = [`${p.name}, sua assinatura foi suspensa.`, "", `Regularize: ${p.payUrl}`].join("\n");
  return { html, text };
}

const subscriptionCanceledSchema = z.object({ name: z.string().min(1), reactivateUrl: z.string().url() });
function renderSaasSubscriptionCanceled(data: unknown): RenderedEmail {
  const p = subscriptionCanceledSchema.parse(data);
  const bodyHtml = `<p style="margin:0 0 16px;">Sua assinatura Vis foi cancelada.</p>
<p style="margin:0 0 22px;">Se mudar de ideia, você pode reativar sua conta a qualquer momento.</p>`;
  const html = renderSaasEmailLayout({
    previewTitle: "Assinatura cancelada",
    heading: `${p.name}, sua assinatura foi cancelada`,
    bodyHtml,
    cta: { label: "Reativar assinatura", url: p.reactivateUrl },
  });
  const text = [`${p.name}, sua assinatura foi cancelada.`, "", `Reativar: ${p.reactivateUrl}`].join("\n");
  return { html, text };
}

// ─── SaaS invoice templates (Fase 2) ─────────────────────────────────────────

/** URL que aceita só http(s) — bloqueia javascript:/data: em hrefs (saída é pré-vista no browser admin). */
const safeUrl = z.string().url().refine(
  (u) => u.startsWith("https://") || u.startsWith("http://"),
  { message: "URL deve usar esquema http ou https" }
);

const invoiceCreatedSchema = z.object({
  name: z.string().min(1),
  amountLabel: z.string().min(1),
  dueDateLabel: z.string().min(1),
  description: z.string().optional(),
  pixCode: z.string().optional(),
  paymentUrl: safeUrl,
  boletoUrl: safeUrl.optional(),
});

function renderInvoiceBody(p: z.infer<typeof invoiceCreatedSchema>, isReminder: boolean): RenderedEmail {
  const amount = escapeHtml(p.amountLabel);
  const due = escapeHtml(p.dueDateLabel);
  const description = p.description ? escapeHtml(p.description) : null;
  const pix = p.pixCode ? escapeHtml(p.pixCode) : null;
  const boleto = p.boletoUrl ? escapeHtml(p.boletoUrl) : null;
  const intro = isReminder
    ? `<p style="margin:0 0 16px;">Passando para lembrar: sua fatura do Vis vence em breve.</p>`
    : `<p style="margin:0 0 16px;">Sua fatura do Vis está disponível.</p>`;
  const descriptionRow = description
    ? `<tr><td style="padding:6px 0 0;font-size:13px;color:#6b7280;">Descrição: <span style="color:#374151;">${description}</span></td></tr>`
    : "";
  const card = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border:1px solid #e5e7eb;border-radius:10px;background:#f8fafc;">
<tr><td style="padding:20px 22px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Valor</td></tr>
<tr><td style="padding:2px 0 0;font-size:28px;font-weight:700;color:#111827;line-height:1.2;">${amount}</td></tr>
<tr><td style="padding:8px 0 0;font-size:14px;color:#374151;">Vencimento: <strong>${due}</strong></td></tr>
${descriptionRow}
</table>
</td></tr>
</table>`;
  const pixBlock = pix
    ? `<p style="margin:0 0 8px;color:#374151;">PIX copia e cola:</p>
<p style="margin:0 0 22px;padding:12px;background:#f3f4f6;border-radius:6px;font-family:monospace;font-size:13px;word-break:break-all;">${pix}</p>`
    : "";
  const boletoBlock = boleto
    ? `<p style="margin:18px 0 0;font-size:13px;"><a href="${boleto}" style="color:#2563eb;">Baixar boleto em PDF</a></p>`
    : "";
  const bodyHtml = `${intro}${card}${pixBlock}<p style="margin:0 0 6px;color:#6b7280;font-size:13px;">Prefere cartão ou ver o QR Code? Clique em "Pagar agora".</p>${boletoBlock}`;
  const html = renderSaasEmailLayout({
    previewTitle: isReminder ? "Sua fatura vence em breve" : "Sua fatura está disponível",
    heading: isReminder ? `${p.name}, sua fatura vence em breve` : `${p.name}, sua fatura está disponível`,
    bodyHtml,
    cta: { label: "Pagar agora", url: p.paymentUrl },
  });
  const textLines = [
    isReminder
      ? `${p.name}, sua fatura do Vis de ${p.amountLabel} vence em ${p.dueDateLabel}.`
      : `${p.name}, sua fatura do Vis de ${p.amountLabel} está disponível (vence ${p.dueDateLabel}).`,
    p.description ? `Descrição: ${p.description}` : "",
    "",
    pix ? `PIX copia e cola: ${p.pixCode}` : "",
    `Pagar agora: ${p.paymentUrl}`,
    boleto ? `Boleto: ${p.boletoUrl}` : "",
  ].filter(Boolean);
  return { html, text: textLines.join("\n") };
}

function renderSaasInvoiceCreated(data: unknown): RenderedEmail {
  return renderInvoiceBody(invoiceCreatedSchema.parse(data), false);
}
function renderSaasInvoiceDueSoon(data: unknown): RenderedEmail {
  return renderInvoiceBody(invoiceCreatedSchema.parse(data), true);
}

// ─── Saúde do Sistema: alerta de incidente ────────────────────────────────────
const systemAlertSchema = z.object({
  /** Estado geral no momento do alerta ("crítico" | "atenção"). */
  severityLabel: z.string().min(1),
  /** Um ou mais incidentes abertos que dispararam o alerta. */
  incidents: z
    .array(z.object({ title: z.string().min(1), detail: z.string().nullable().optional() }))
    .min(1),
  /** Link direto pra tela "O Pulso". */
  dashboardUrl: z.string().url(),
});
function renderSystemAlert(data: unknown): RenderedEmail {
  const p = systemAlertSchema.parse(data);
  // bodyHtml é injetado CRU pelo layout → escapar cada dado dinâmico aqui.
  const items = p.incidents
    .map((i) => {
      const title = escapeHtml(i.title);
      const detail = i.detail ? `<br /><span style="color:#6b7280;font-size:13px;">${escapeHtml(i.detail)}</span>` : "";
      return `<li style="margin:0 0 10px;"><strong>${title}</strong>${detail}</li>`;
    })
    .join("");
  const bodyHtml = `<p style="margin:0 0 16px;">O monitoramento do Vis detectou um incidente que precisa da sua atenção (estado: <strong>${escapeHtml(p.severityLabel)}</strong>).</p>
<ul style="margin:0 0 22px;padding-left:20px;">${items}</ul>
<p style="margin:0 0 22px;color:#6b7280;font-size:13px;">Você está recebendo isto porque um sinal do sistema saiu do verde. Abra o painel para ver os detalhes e o histórico.</p>`;
  const html = renderSaasEmailLayout({
    previewTitle: "Alerta do sistema Vis",
    heading: "Alerta do sistema",
    bodyHtml,
    cta: { label: "Abrir o Pulso", url: p.dashboardUrl },
  });
  const text = [
    `ALERTA DO SISTEMA VIS (${p.severityLabel})`,
    "",
    ...p.incidents.map((i) => `- ${i.title}${i.detail ? `: ${i.detail}` : ""}`),
    "",
    `Abra o painel: ${p.dashboardUrl}`,
  ].join("\n");
  return { html, text };
}

// ─── router ───────────────────────────────────────────────────────────────────

export function renderEmailTemplate(template: string, data: unknown): RenderedEmail {
  switch (template) {
    case "invite":
      return renderInviteEmail(data);
    case "saas-welcome":
      return renderSaasWelcome(data);
    case "saas-trial-ending":
      return renderSaasTrialEnding(data);
    case "saas-trial-expired":
      return renderSaasTrialExpired(data);
    case "saas-invoice-overdue":
      return renderSaasInvoiceOverdue(data);
    case "saas-payment-confirmed":
      return renderSaasPaymentConfirmed(data);
    case "saas-subscription-suspended":
      return renderSaasSubscriptionSuspended(data);
    case "saas-subscription-canceled":
      return renderSaasSubscriptionCanceled(data);
    case "saas-invoice-created":
      return renderSaasInvoiceCreated(data);
    case "saas-invoice-due-soon":
      return renderSaasInvoiceDueSoon(data);
    case "system-alert":
      return renderSystemAlert(data);
    default:
      throw new Error(`Unsupported email template: ${template}`);
  }
}
