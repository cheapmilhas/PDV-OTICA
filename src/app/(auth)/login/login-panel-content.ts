// Fonte de verdade do painel de novidades do login. O dono edita SÓ este arquivo
// e faz commit+deploy. Linguagem de balcão, não release notes técnicas.

export interface LoginRelease {
  /** ISO "YYYY-MM-DD". */
  date: string;
  /** Título curto, linguagem de balcão. */
  title: string;
  /** 2-3 bullets, TEXTO PURO (sem links). */
  items: string[];
}

export interface LoginPanelContent {
  /** Idealmente mais recente primeiro; o componente ordena defensivamente por date desc. */
  releases: LoginRelease[];
}

export const loginPanelContent: LoginPanelContent = {
  releases: [
    {
      date: "2026-07-10",
      title: "Estoque por filial mais claro",
      items: [
        "Agora você escolhe em qual filial o produto entra no cadastro.",
        "Transferências entre filiais ficaram mais fáceis de encontrar.",
      ],
    },
  ],
};
