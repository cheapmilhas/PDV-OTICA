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
  }
}
