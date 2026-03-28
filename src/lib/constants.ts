export const SITE_NAME = "PDV Ótica";
export const SITE_URL = "https://pdvotica.com.br";
export const APP_URL = "https://app.pdvotica.com.br";
export const WHATSAPP_NUMBER = "5585999999999"; // Trocar pelo número real
export const WHATSAPP_MESSAGE = encodeURIComponent(
  "Olá! Tenho interesse no PDV Ótica. Pode me contar mais?"
);
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MESSAGE}`;

export const REGISTER_URL = `${APP_URL}/registro`;
export const DEMO_URL = `${APP_URL}/demo`;

export const SITE_DESCRIPTION =
  "O sistema completo para gestão da sua ótica. PDV, estoque, financeiro, laboratórios, NF-e e muito mais. Experimente grátis.";

export const NAV_LINKS = [
  { label: "Funcionalidades", href: "/funcionalidades" },
  { label: "Planos", href: "/precos" },
  { label: "Blog", href: "/blog" },
  { label: "Contato", href: "/contato" },
];

export const FOOTER_LINKS = {
  produto: [
    { label: "Funcionalidades", href: "/funcionalidades" },
    { label: "Planos e Preços", href: "/precos" },
    { label: "Migração", href: "/migracao" },
    { label: "Integrações", href: "/funcionalidades#integracoes" },
  ],
  empresa: [
    { label: "Sobre nós", href: "/sobre" },
    { label: "Blog", href: "/blog" },
    { label: "Contato", href: "/contato" },
    { label: "Carreiras", href: "/carreiras" },
  ],
  recursos: [
    { label: "Documentação", href: "/docs" },
    { label: "Suporte", href: "/contato" },
    { label: "Status do sistema", href: "https://status.pdvotica.com.br" },
    { label: "Atualizações", href: "/blog" },
  ],
  legal: [
    { label: "Política de Privacidade", href: "/privacidade" },
    { label: "Termos de Uso", href: "/termos" },
    { label: "LGPD", href: "/privacidade#lgpd" },
    { label: "Cookies", href: "/privacidade#cookies" },
  ],
};
