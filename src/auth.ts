import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";

// SEGURANÇA: hash dummy bcrypt para comparar quando usuário não existe.
// Sem isso, há timing leak: !user retorna ~0ms, user existente retorna ~80ms
// (custo do bcrypt.compare). Atacante mede e enumera emails válidos.
const DUMMY_HASH = "$2b$10$abcdefghijklmnopqrstuv0123456789012345678901234567890Yzab";

const loginSchema = z.object({
  email: z.string().min(1), // Aceita login ou email
  password: z.string().min(8),
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

          // SEGURANÇA: rate limit por chave de login. Sem IP confiável dentro do
          // authorize callback do NextAuth, usamos o próprio login — limita
          // tentativas por conta (ataque a uma conta específica).
          const limit = checkRateLimit(`login:${login.toLowerCase()}`, {
            maxRequests: 10,
            windowMs: 5 * 60 * 1000,
          });
          if (!limit.allowed) {
            console.warn(`Rate limit login excedido para ${login}`);
            return null;
          }

          // Q8.4: email passou a ser único POR EMPRESA (@@unique([companyId,email])),
          // então o mesmo email/login pode existir em mais de uma empresa (dono com
          // 2 lojas, funcionário em 2 óticas-cliente). Buscamos TODOS os candidatos
          // e validamos a senha contra cada um, de forma DETERMINÍSTICA (ordem por
          // createdAt), entrando no primeiro que bater. Para email único (99% dos
          // casos) o comportamento é idêntico ao anterior.
          const emailCandidate = login.includes("@")
            ? login
            : `${login.toLowerCase()}@login`;
          const users = await prisma.user.findMany({
            where: {
              OR: [{ email: login }, { email: emailCandidate }],
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
            orderBy: { createdAt: "asc" },
          });

          // Valida a senha contra cada candidato; entra no primeiro que bater.
          let user: (typeof users)[number] | null = null;
          for (const candidate of users) {
            if (!candidate.passwordHash) continue;
            if (await bcrypt.compare(password, candidate.passwordHash)) {
              user = candidate;
              break;
            }
          }

          if (!user) {
            // SEGURANÇA: bcrypt dummy mesmo sem match para igualar o tempo de
            // resposta (senão atacante mede latência e enumera emails). Só roda
            // quando NENHUM candidato bateu — inclui o caso de zero candidatos.
            await bcrypt.compare(password, DUMMY_HASH);
            console.log(`❌ Login inválido para ${login}`);
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
        token.revalidatedAt = Date.now();
        return token;
      }

      // Se for um update da sessão (ex: após signOut), resetar o token
      if (trigger === "update") {
        console.log("🔄 JWT callback - Update trigger");
      }

      // Q8.3: revogação REAL de impersonação. O token de impersonação é
      // hand-encoded com a claim `impersonation.sessionId` e antes só expirava
      // pelo TTL do JWT (30min) — encerrar/expirar a sessão no banco era
      // cosmético. Aqui revalidamos a ImpersonationSession a cada passagem:
      // se foi encerrada (endedAt) ou expirou (expiresAt), invalida o token
      // (return null → próximo acesso cai pra login). Janela curta porque é
      // sensível e a sessão é curta; falha transitória de DB NÃO desloga.
      const impersonation = token.impersonation;
      if (impersonation?.sessionId) {
        const IMP_REVALIDATE_TTL_MS = 60 * 1000; // 1 min
        const lastImpCheck = token.impRevalidatedAt;
        if (!lastImpCheck || Date.now() - lastImpCheck > IMP_REVALIDATE_TTL_MS) {
          try {
            const imp = await prisma.impersonationSession.findUnique({
              where: { id: impersonation.sessionId },
              select: { endedAt: true, expiresAt: true },
            });
            if (!imp || imp.endedAt !== null || imp.expiresAt.getTime() < Date.now()) {
              // Sessão encerrada/expirada/inexistente → revoga de verdade.
              return null;
            }
            token.impRevalidatedAt = Date.now();
          } catch (err) {
            // Falha transitória de DB: não desloga (evita falso logout).
            console.error("Revalidação de impersonação falhou (não-fatal):", err);
          }
        }
      }

      // M12: revalida role/existência do usuário no banco periodicamente. A
      // sessão dura 30 dias e o role vivia só no token — rebaixar/demitir não
      // tinha efeito até relogar. Revalida a cada REVALIDATE_TTL_MS buscando o
      // usuário fresco; se foi desativado/excluído, zera o token (força logout
      // no próximo acesso). Não bate no banco a cada request (TTL curto).
      const REVALIDATE_TTL_MS = 5 * 60 * 1000; // 5 min
      const lastRevalidated = (token.revalidatedAt as number) || 0;
      if (token.id && Date.now() - lastRevalidated > REVALIDATE_TTL_MS) {
        try {
          const fresh = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: {
              id: true,
              role: true,
              active: true,
              name: true,
              companyId: true,
              company: { select: { networkId: true } },
              branches: {
                take: 1,
                select: { branchId: true },
              },
            },
          });

          if (!fresh || fresh.active === false) {
            // Usuário demitido/desativado/excluído → invalida o token.
            return null;
          }

          // Aplica role/nome/empresa/filial frescos (rebaixar/promover/transferir
          // passa a valer sem precisar relogar).
          token.role = fresh.role;
          token.name = fresh.name;
          token.companyId = fresh.companyId;
          token.networkId = fresh.company?.networkId ?? null;
          if (fresh.branches[0]?.branchId) {
            token.branchId = fresh.branches[0].branchId;
          }
          token.revalidatedAt = Date.now();
        } catch (err) {
          // Falha transitória de DB: NÃO desloga (evita falso logout em massa).
          // Apenas adia a revalidação para a próxima passagem.
          console.error("JWT revalidation falhou (não-fatal):", err);
        }
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
