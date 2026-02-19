import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authAdminConfig } from "./auth-admin.config";

export const {
  handlers: adminHandlers,
  auth: authAdmin,
  signIn: signInAdmin,
  signOut: signOutAdmin,
} = NextAuth({
  ...authAdminConfig,
  providers: [
    Credentials({
      name: "Admin Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        const admin = await prisma.adminUser.findUnique({
          where: { email },
        });

        if (!admin || !admin.active) {
          return null;
        }

        const isValid = await bcrypt.compare(password, admin.password);
        if (!isValid) {
          return null;
        }

        // Atualizar lastLoginAt
        await prisma.adminUser.update({
          where: { id: admin.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          isAdmin: true,
        } as any;
      },
    }),
  ],
});
