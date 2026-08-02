export const SITE_NAME = "Vis";
export const SITE_URL = "https://vis.app.br";
export const APP_URL = "https://vis.app.br";
// ⚠️ TODO(dono): número de WhatsApp de VENDAS ainda é PLACEHOLDER.
// (O 558599252772 que aparece em feature-gate/upgrade-banner é o de SUPORTE —
// decisão do dono é não usá-lo no marketing.)
//
// Enquanto for placeholder, `WHATSAPP_ENABLED` é false e TODO CTA de WhatsApp do
// site público some. É falha segura: mandar o lead para um número inexistente é
// pior que não oferecer o canal. Ao preencher o número real, os CTAs voltam
// sozinhos — nenhum outro arquivo precisa mudar.
export const WHATSAPP_NUMBER = "5585999999999"; // TODO: TROCAR PELO NÚMERO REAL

/** Sentinela histórica. Qualquer número igual a este conta como "não configurado". */
const WHATSAPP_PLACEHOLDER = "5585999999999";
/** 55 + DDD + 8/9 dígitos. Vazio ou malformado também reprova. */
const REAL_PHONE = /^\d{12,15}$/;

/**
 * Fonte única da verdade sobre exibir (ou não) os CTAs de WhatsApp.
 * Consumido pelo header, hero, footer, exit popup, botão flutuante, /contato e
 * pelo card do plano Rede — o mesmo critério que `login-side-panel` já aplicava
 * isolado.
 */
export const WHATSAPP_ENABLED =
  REAL_PHONE.test(WHATSAPP_NUMBER) && WHATSAPP_NUMBER !== WHATSAPP_PLACEHOLDER;

// Neutra de propósito: este link também é servido na /medical e na home
// institucional, onde o visitante pode ser de clínica. Dizer "sistema para
// óticas" fazia o lead de clínica se apresentar como lead do produto errado.
export const WHATSAPP_MESSAGE = encodeURIComponent(
  "Olá! Tenho interesse no Vis. Pode me contar mais?"
);
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MESSAGE}`;

/**
 * "5585988887777" → "(85) 98888-7777". Deriva do MESMO número que o link usa:
 * a /contato exibia o telefone como texto digitado à mão, então o dia em que o
 * número mudasse o link e o texto divergiriam sem ninguém notar.
 */
export function formatWhatsAppDisplay(raw: string): string {
  const d = raw.replace(/\D/g, "").replace(/^55/, "");
  if (d.length < 10) return raw;
  const ddd = d.slice(0, 2);
  const corpo = d.slice(2);
  const meio = corpo.length === 9 ? corpo.slice(0, 5) : corpo.slice(0, 4);
  const fim = corpo.length === 9 ? corpo.slice(5) : corpo.slice(4);
  return `(${ddd}) ${meio}-${fim}`;
}

export const REGISTER_URL = "/registro";
export const LOGIN_URL = "/login";

/**
 * Login da aplicação MEDICAL. Vive em OUTRO domínio: o site é aquisição,
 * medical.vis.app.br é a aplicação. Por isso o link abre em nova aba.
 *
 * `NEXT_PUBLIC_` é obrigatório: quem consome isto é o header, que é client
 * component. A env `MEDICAL_APP_URL` (sem prefixo) usada em
 * provisioning-outbox.service.ts:51 é de SERVIDOR e inlinearia como `undefined`
 * no cliente.
 *
 * O fallback cobre o estado atual (env não configurada) e está verificado no ar:
 * medical.vis.app.br/authentication responde 200.
 */
export const MEDICAL_LOGIN_URL = `${
  process.env.NEXT_PUBLIC_MEDICAL_APP_URL ?? "https://medical.vis.app.br"
}/authentication`;

/**
 * Meta description da home. É CONSUMIDA pelo RootLayout — não duplicar o texto lá.
 *
 * Ficou órfã por um tempo (o layout tinha a própria string hardcoded), e a
 * duplicação escondeu um furo: a copy do site foi reposicionada para dois
 * produtos, mas o metadado que o Google e o WhatsApp leem continuou dizendo
 * "sistema de gestão para óticas".
 *
 * Mantém os termos óticos que já ranqueiam (PDV, ordem de serviço de lentes) e
 * ACRESCENTA os de clínica. Somar, nunca trocar.
 */
export const SITE_DESCRIPTION =
  "Vis são dois sistemas de gestão: um para óticas (PDV, ordens de serviço de lentes, estoque e financeiro) e outro para clínicas e consultórios de qualquer especialidade (prontuário eletrônico, agenda e receituário). Comece grátis, sem cartão e sem fidelidade.";

// Os dois segmentos abrem o menu: a home é institucional e o visitante precisa
// se identificar antes de qualquer outra coisa. "Planos" leva à /precos, que
// tem a alternância entre os produtos.
export const NAV_LINKS = [
  { label: "Para óticas", href: "/oticas" },
  { label: "Para clínicas", href: "/medical" },
  { label: "Planos", href: "/precos" },
  { label: "Blog", href: "/blog" },
  { label: "Contato", href: "/contato" },
];

export const FOOTER_LINKS = {
  produto: [
    { label: "Funcionalidades", href: "/funcionalidades" },
    { label: "PDV para ótica", href: "/funcionalidades/pdv-para-otica" },
    { label: "Ordem de serviço", href: "/funcionalidades/ordem-de-servico-otica" },
    { label: "Controle de estoque", href: "/funcionalidades/controle-de-estoque-otica" },
    { label: "Gestão financeira", href: "/funcionalidades/gestao-financeira-otica" },
    { label: "Leitura de receita por IA", href: "/funcionalidades/leitura-de-receita-ia" },
    { label: "Planos e Preços", href: "/precos" },
  ],
  // O link de WhatsApp entra na lista só quando há número de vendas — este é
  // um item de DADOS, não JSX, então não bastava esconder no componente.
  empresa: [
    { label: "Contato", href: "/contato" },
    ...(WHATSAPP_ENABLED ? [{ label: "Falar no WhatsApp", href: WHATSAPP_URL }] : []),
    { label: "Entrar", href: LOGIN_URL },
    { label: "Começar grátis", href: REGISTER_URL },
  ],
  recursos: [
    { label: "Blog", href: "/blog" },
    { label: "Vis vs Planilha", href: "/vis-vs-planilha" },
  ],
  // O link para o OUTRO produto saiu daqui: ele precisa inverter conforme a
  // rota (dentro da /medical, o "outro produto" é o Vis para óticas, e o item
  // fixo virava um self-link). Passou a viver em `FooterOtherProduct`, no
  // landing-layout/footer-tagline.tsx, que conhece o pathname.
  legal: [
    { label: "Política de Privacidade", href: "/privacidade" },
    { label: "Termos de Uso", href: "/termos" },
    { label: "LGPD", href: "/privacidade#lgpd" },
  ],
};
