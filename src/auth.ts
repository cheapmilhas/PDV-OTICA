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
  // adapter: PrismaAdapter(prisma), // Comentado temporariamente devido a conflito de tipos no NextAuth v5 beta
  trustHost: true, // Necessário para produção (Vercel)
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

          // Mock user (apenas se AUTH_MOCK=true no .env)
          if (process.env.AUTH_MOCK === "true") {
            if (email === "admin@pdvotica.com" && password === "admin123") {
              return {
                id: "mock-user-id",
                name: "Admin Mock",
                email: "admin@pdvotica.com",
                role: "ADMIN",
                branchId: "mock-branch-id",
                companyId: "mock-company-id",
              };
            }
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
        token.role = user.role;
        token.branchId = user.branchId;
        token.companyId = user.companyId;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as any;
        session.user.branchId = token.branchId as string;
        session.user.companyId = token.companyId as string;
      }
      return session;
    },
  },
});
