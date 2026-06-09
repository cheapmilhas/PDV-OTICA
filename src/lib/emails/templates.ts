import { z } from "zod";
import { escapeHtml } from "@/lib/escape-html";

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

export function renderEmailTemplate(template: string, data: unknown): RenderedEmail {
  switch (template) {
    case "invite":
      return renderInviteEmail(data);
    default:
      throw new Error(`Unsupported email template: ${template}`);
  }
}
