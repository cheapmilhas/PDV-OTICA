import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          const { email, password } = loginSchema.parse(credentials);

          // TODO: Remover este usuário mock após configurar banco de dados
          // Mock user para desenvolvimento
          if (email === "admin@pdvotica.com" && password === "admin123") {
            return {
              id: "1",
              name: "Admin",
              email: "admin@pdvotica.com",
              role: "ADMIN",
              branchId: "1",
            };
          }

          // Buscar usuário no banco de dados
          const user = await prisma.user.findUnique({
            where: { email },
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
            return null;
          }

          // Pegar o primeiro branch do usuário
          const firstBranch = user.branches[0]?.branch;

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            branchId: firstBranch?.id || "mock-branch-id",
            companyId: user.companyId,
          };
        } catch (error) {
          console.error("Auth error:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.branchId = (user as any).branchId;
        token.companyId = (user as any).companyId;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).role = token.role as string;
        (session.user as any).branchId = token.branchId as string;
        (session.user as any).companyId = token.companyId as string;
      }
      return session;
    },
  },
});
