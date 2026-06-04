export const SITE_NAME = "Vis";
export const SITE_URL = "https://vis.app.br";
export const APP_URL = "https://vis.app.br";
export const WHATSAPP_NUMBER = "5585999999999"; // Trocar pelo número real
export const WHATSAPP_MESSAGE = encodeURIComponent(
  "Olá! Tenho interesse no Vis, o sistema de gestão para óticas. Pode me contar mais?"
);
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MESSAGE}`;

export const REGISTER_URL = "/registro";
export const LOGIN_URL = "/login";
export const DEMO_URL = "/demo";

export const SITE_DESCRIPTION =
  "A gestão clara da sua ótica. Vendas, ordens de serviço de lentes, estoque e financeiro num sistema simples, feito para óticas modernas. Comece grátis.";

export const NAV_LINKS = [
  { label: "Funcionalidades", href: "/#funcionalidades" },
  { label: "Planos", href: "/precos" },
  { label: "Contato", href: "/contato" },
];

export const FOOTER_LINKS = {
  produto: [
    { label: "Funcionalidades", href: "/#funcionalidades" },
    { label: "Planos e Preços", href: "/precos" },
    { label: "Comece grátis", href: REGISTER_URL },
    { label: "Falar com consultor", href: WHATSAPP_URL },
  ],
  empresa: [
    { label: "Contato", href: "/contato" },
    { label: "Entrar", href: LOGIN_URL },
    { label: "Comece grátis", href: REGISTER_URL },
  ],
  recursos: [
    { label: "Suporte", href: "/contato" },
    { label: "Falar no WhatsApp", href: WHATSAPP_URL },
  ],
  legal: [
    { label: "Política de Privacidade", href: "/privacidade" },
    { label: "Termos de Uso", href: "/termos" },
    { label: "LGPD", href: "/privacidade#lgpd" },
  ],
};
