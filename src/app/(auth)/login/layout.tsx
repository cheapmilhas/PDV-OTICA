import type { Metadata } from "next";

/**
 * O segmento não tinha metadata nenhuma: em produção o /login saía com o TÍTULO
 * e a DESCRIPTION da home ("Vis — Sistemas de gestão para óticas e clínicas") e
 * com `robots: index,follow` — contradizendo o `robots.ts`, que já bloqueia
 * /login no crawl. Tela de autenticação não tem valor de busca; o que ela
 * precisa é de um título honesto na aba e de não competir com a home.
 */
export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse sua conta do Vis.",
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
