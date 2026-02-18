import type { NextAuthConfig } from "next-auth";

/**
 * Configuração do NextAuth compatível com Edge Runtime.
 * NÃO importa Prisma, bcrypt ou qualquer biblioteca Node.js.
 * Usada apenas pelo middleware para verificar sessão JWT.
 */
export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 dias
  },
  pages: {
    signIn: "/login",
  },
  cookies: {
    sessionToken: {
      name: "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  providers: [],
  callbacks: {
    // Propaga campos customizados do token para auth.user no middleware
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.branchId = (user as any).branchId;
        token.companyId = (user as any).companyId;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).role = token.role;
        (session.user as any).branchId = token.branchId;
        (session.user as any).companyId = token.companyId;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
      const isOnLogin = nextUrl.pathname === "/login";
      const userRole = (auth?.user as any)?.role as string | undefined;
      const isOnPermissionsPage = nextUrl.pathname.includes("/permissoes");

      if (isOnDashboard && !isLoggedIn) {
        return false; // NextAuth redireciona para pages.signIn automaticamente
      }

      if (isOnLogin && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      // Só bloqueia se está logado e NÃO é ADMIN
      if (isOnPermissionsPage && isLoggedIn && userRole !== "ADMIN") {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      return true;
    },
  },
};
