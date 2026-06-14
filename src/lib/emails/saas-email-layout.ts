import { escapeHtml } from "@/lib/escape-html";

export interface SaasEmailCta {
  label: string;
  url: string;
}

export interface SaasEmailLayoutInput {
  /** vai no <title>, não exibido no corpo */
  previewTitle: string;
  /** título grande do email (texto puro, será escapado) */
  heading: string;
  /** corpo já em HTML seguro (montado pelo template, dados já escapados lá) */
  bodyHtml: string;
  cta?: SaasEmailCta;
}

const BRAND = "#2E6BFF";

/**
 * Layout base "modo email" da marca Vis: tabelas, CSS inline, ~600px.
 * Os templates montam `bodyHtml` com seus próprios dados (já escapados) e
 * passam um CTA opcional. O `heading` é escapado aqui.
 */
export function renderSaasEmailLayout(input: SaasEmailLayoutInput): string {
  const title = escapeHtml(input.previewTitle);
  const heading = escapeHtml(input.heading);
  const ctaHtml = input.cta
    ? `<p style="margin:0 0 26px;">
         <a href="${escapeHtml(input.cta.url)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;border-radius:6px;padding:12px 20px;font-weight:700;">${escapeHtml(
        input.cta.label
      )}</a>
       </p>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;background:#f6f7fb;color:#111827;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7fb;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px 16px;border-bottom:3px solid ${BRAND};">
                <img src="https://vis.app.br/vis-logo-email.png" alt="Vis" height="28" style="display:block;border:0;outline:none;text-decoration:none;height:28px;width:auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 8px;">
                <h1 style="margin:0;color:#111827;font-size:24px;line-height:1.25;">${heading}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 28px 4px;color:#374151;font-size:15px;line-height:1.6;">
                ${input.bodyHtml}
                ${ctaHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:22px 28px 28px;color:#9ca3af;font-size:12px;line-height:1.5;border-top:1px solid #f0f1f4;">
                Vis — Sistema de gestão para óticas.<br />
                Você recebeu este email porque tem uma conta no Vis.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
