import { DefaultSession } from "next-auth";
import { UserRole } from "@prisma/client";

declare module "next-auth" {
  /**
   * Extensão do tipo User retornado pelo authorize()
   */
  interface User {
    id: string;
    role: UserRole;
    companyId: string;
    branchId: string;
    networkId: string | null;
    /** Reset de senha: baseline para revogação de sessão (epoch ms | null). */
    passwordChangedAt?: number | null;
  }

  /**
   * Extensão da Session retornada por useSession() e auth()
   */
  interface Session {
    user: User & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  /**
   * Extensão do JWT Token
   */
  interface JWT {
    id: string;
    role: UserRole;
    companyId: string;
    branchId: string;
    networkId: string | null;
    /** M12: timestamp da última revalidação de role/existência do usuário. */
    revalidatedAt?: number;
    /**
     * Reset de senha: baseline (epoch ms) da última troca conhecida NO LOGIN.
     * Fixado no login e NUNCA reescrito a partir do `fresh` — a revalidação M12
     * compara este baseline com `User.passwordChangedAt` do banco para revogar
     * sessões anteriores à troca. null = login sem troca registrada.
     */
    passwordChangedAt?: number | null;
    /** Q8.3: claim presente só em token de impersonação (hand-encoded). */
    impersonation?: {
      sessionId: string;
      adminId?: string;
      adminName?: string;
      adminEmail?: string;
    };
    /** Q8.3: timestamp da última revalidação da ImpersonationSession no banco. */
    impRevalidatedAt?: number;
  }
}
