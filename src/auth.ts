import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().min(1), // Aceita login ou email
  password: z.string().min(6),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  // adapter: PrismaAdapter(prisma), // Comentado temporariamente devido a conflito de tipos no NextAuth v5 beta
  trustHost: true, // Necessário para produção (Vercel)
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
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          const { email: login, password } = loginSchema.parse(credentials);

          // Buscar por email OU por nome (login)
          const user = await prisma.user.findFirst({
            where: {
              OR: [
                { email: login },
                { email: login.includes("@") ? login : `${login.toLowerCase()}@login` },
              ],
            },
            include: {
              company: true,
              branches: {
                include: {
                  branch: {
                    include: {
                      company: true,
                    },
                  },
                },
              },
            },
          });

          if (!user || !user.passwordHash) {
            return null;
          }

          const isPasswordValid = await bcrypt.compare(
            password,
            user.passwordHash
          );

          if (!isPasswordValid) {
            console.log(`❌ Senha inválida para ${login}`);
            return null;
          }

          // Pegar o primeiro branch do usuário
          const firstBranch = user.branches[0]?.branch;

          if (!firstBranch) {
            console.log(`❌ Usuário ${login} não possui filial vinculada`);
            return null;
          }

          const authData = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            branchId: firstBranch.id,
            companyId: user.companyId,
            networkId: user.company?.networkId || null,
          };

          console.log(`✅ Login bem-sucedido:`, {
            name: authData.name,
            email: authData.email,
            role: authData.role,
            companyId: authData.companyId,
            networkId: authData.networkId,
          });

          return authData;
        } catch (error) {
          console.error("Auth error:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async redirect({ url, baseUrl }) {
      // URLs relativas: adicionar baseUrl
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // URLs do mesmo domínio: permitir
      else if (new URL(url).origin === baseUrl) return url;
      // Padrão: dashboard
      return `${baseUrl}/dashboard`;
    },
    async jwt({ token, user, trigger }) {
      // Se for um novo login, atualizar o token com dados do usuário
      if (user) {
        console.log("🔐 JWT callback - Novo login:", {
          email: user.email,
          role: user.role,
        });

        token.id = user.id;
        token.name = user.name;
        token.email = user.email;
        token.role = user.role;
        token.branchId = user.branchId;
        token.companyId = user.companyId;
        token.networkId = user.networkId;
      }

      // Se for um update da sessão (ex: após signOut), resetar o token
      if (trigger === "update") {
        console.log("🔄 JWT callback - Update trigger");
      }

      return token;
    },
    async session({ session, token }) {
      // Sempre pegar dados do token (nunca manter dados antigos)
      if (token && session.user) {
        console.log("👤 Session callback - Token:", {
          email: token.email,
          role: token.role,
        });

        session.user.id = token.id as string;
        session.user.name = token.name as string;
        session.user.email = token.email as string;
        session.user.role = token.role as any;
        session.user.branchId = token.branchId as string;
        session.user.companyId = token.companyId as string;
        session.user.networkId = token.networkId as string | null;
      }
      return session;
    },
  },
});
