import type { NextAuthConfig } from "next-auth";

/**
 * Configuração do NextAuth para Admin - compatível com Edge Runtime.
 * NÃO importa Prisma, bcrypt ou qualquer biblioteca Node.js.
 * Usada pelo middleware para proteger rotas /admin/**
 */
export const authAdminConfig: NextAuthConfig = {
  trustHost: true,
  basePath: "/api/admin/auth",
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 horas
  },
  pages: {
    signIn: "/admin/login",
    error: "/admin/login",
  },
  // Cookie separado para não conflitar com sessão do PDV
  cookies: {
    sessionToken: {
      name: "admin.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnAdminArea = nextUrl.pathname.startsWith("/admin");
      const isOnAdminLogin = nextUrl.pathname === "/admin/login";
      const isAdminUser = (auth?.user as any)?.isAdmin === true;

      // /admin/login: se já logado como admin, redireciona para /admin
      if (isOnAdminLogin && isLoggedIn && isAdminUser) {
        return Response.redirect(new URL("/admin", nextUrl));
      }

      // /admin/** (exceto login): requer estar logado como admin
      if (isOnAdminArea && !isOnAdminLogin) {
        if (!isLoggedIn || !isAdminUser) {
          return Response.redirect(new URL("/admin/login", nextUrl));
        }
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.email = user.email;
        token.name = user.name;
        token.role = (user as any).role;
        token.isAdmin = true;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).isAdmin = token.isAdmin;
      }
      return session;
    },
  },
  providers: [],
};
