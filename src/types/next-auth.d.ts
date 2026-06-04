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
