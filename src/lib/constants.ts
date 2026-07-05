export const SITE_NAME = "Vis";
export const SITE_URL = "https://vis.app.br";
export const APP_URL = "https://vis.app.br";
// ⚠️ TODO(dono): número de WhatsApp PLACEHOLDER — leads que clicam em "Falar com
// consultor", no botão flutuante e no "Esqueci minha senha" caem num número
// inexistente. Trocar por 55 + DDD + número real (ex.: "5585988887777").
export const WHATSAPP_NUMBER = "5585999999999"; // TODO: TROCAR PELO NÚMERO REAL
export const WHATSAPP_MESSAGE = encodeURIComponent(
  "Olá! Tenho interesse no Vis, o sistema de gestão para óticas. Pode me contar mais?"
);
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MESSAGE}`;

export const REGISTER_URL = "/registro";
export const LOGIN_URL = "/login";

export const SITE_DESCRIPTION =
  "A gestão clara da sua ótica. Vendas, ordens de serviço de lentes, estoque e financeiro num sistema simples, feito para óticas modernas. Comece grátis.";

export const NAV_LINKS = [
  { label: "Funcionalidades", href: "/funcionalidades" },
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
  empresa: [
    { label: "Contato", href: "/contato" },
    { label: "Falar no WhatsApp", href: WHATSAPP_URL },
    { label: "Entrar", href: LOGIN_URL },
    { label: "Começar grátis", href: REGISTER_URL },
  ],
  recursos: [
    { label: "Blog", href: "/blog" },
    { label: "Vis vs Planilha", href: "/vis-vs-planilha" },
  ],
  legal: [
    { label: "Política de Privacidade", href: "/privacidade" },
    { label: "Termos de Uso", href: "/termos" },
    { label: "LGPD", href: "/privacidade#lgpd" },
  ],
};
