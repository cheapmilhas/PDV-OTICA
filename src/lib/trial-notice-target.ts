import type { PlatformProduct } from "@/lib/admin-product-context";

/**
 * Para onde o aviso de trial manda o cliente — decidido pelo PRODUTO dele.
 *
 * 🔥 O defeito que isto conserta: o cron mandava TODO mundo para
 * `${base}/dashboard/upgrade`, que é tela do app Vis. O cliente `VIS_MEDICAL`
 * usa outro sistema (Domus, em medical.vis.app.br) e NÃO tem usuário no Vis —
 * ele recebia "Assine agora" e batia numa porta trancada.
 *
 * Enquanto não existe cobrança recorrente medical, a resposta honesta é
 * **avisar sem CTA**: o cliente precisa saber que o teste acaba, mas mandá-lo
 * a um link que ele não abre (ou ao convite de login, que não é destino de
 * cobrança) seria só trocar um CTA enganoso por outro.
 *
 * Função PURA: a decisão fica testável sem banco, sem e-mail e sem cron.
 */

/** Variante de template usada quando não há destino de assinatura. */
export const MEDICAL_TRIAL_ENDING_TEMPLATE = "saas-trial-ending-medical";
export const MEDICAL_TRIAL_EXPIRED_TEMPLATE = "saas-trial-expired-medical";

export interface TrialNotice {
  /** URL do botão "Assinar agora". `null` = e-mail informativo, sem CTA. */
  subscribeUrl: string | null;
  /**
   * Link da notificação in-app, ou `null` para NÃO criar notificação in-app.
   *
   * 🔑 `null` para medical não é economia de código: a notificação in-app é
   * servida DENTRO do app Vis (`companyNotificationScope` filtra pela empresa
   * do usuário logado). Sem usuário no Vis, a linha criada nunca seria lida por
   * ninguém — seria ruído no banco fingindo que o cliente foi avisado.
   */
  inappLink: string | null;
  /**
   * Template alternativo, quando o padrão não serve.
   *
   * Os templates óticos exigem `subscribeUrl` obrigatório no Zod
   * (`templates.ts`) — de propósito, para que ninguém remova o CTA da ótica sem
   * quebrar o build. Medical usa template PRÓPRIO em vez de afrouxar aquele.
   */
  templateOverride: { ending: string; expired: string } | null;
}

export function resolveTrialNotice(
  product: PlatformProduct,
  baseUrl: string,
): TrialNotice {
  switch (product) {
    case "VIS_MEDICAL":
      return {
        subscribeUrl: null,
        inappLink: null,
        templateOverride: {
          ending: MEDICAL_TRIAL_ENDING_TEMPLATE,
          expired: MEDICAL_TRIAL_EXPIRED_TEMPLATE,
        },
      };

    case "VIS_APP":
      return {
        subscribeUrl: `${baseUrl}/dashboard/upgrade`,
        inappLink: "/dashboard/upgrade",
        templateOverride: null,
      };

    default:
      // `switch` exaustivo em vez de `if (medical) ... else ótica`: um produto
      // NOVO no enum cairia no ramo "ótica" e receberia CTA para uma tela que
      // talvez não seja a dele. Aqui o tsc obriga a decidir, e um valor vindo
      // de JS/cast falha alto em vez de errar em silêncio.
      return assertNeverProduct(product);
  }
}

function assertNeverProduct(product: never): never {
  throw new Error(`Produto sem regra de aviso de trial: ${String(product)}`);
}
