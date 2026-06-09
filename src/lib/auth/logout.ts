"use client";

import { signOut } from "next-auth/react";

/**
 * Logout do app cliente. Sempre redireciona para /login no domínio ATUAL
 * (window.location.origin), evitando o redirect para o domínio antigo da Vercel
 * quando NEXTAUTH_URL/baseUrl está configurado errado. Use em TODOS os pontos de
 * logout client do app.
 */
export function doLogout(): void {
  signOut({ callbackUrl: `${window.location.origin}/login` });
}
