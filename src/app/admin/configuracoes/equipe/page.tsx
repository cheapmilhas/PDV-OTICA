import { requireAdminRole } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { EquipeClient } from "./equipe-client";

export default async function UsuariosAdminPage() {
  const currentAdmin = await requireAdminRole(["SUPER_ADMIN", "ADMIN"]);

  const admins = await prisma.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  const serializedAdmins = admins.map((admin) => ({
    ...admin,
    lastLoginAt: admin.lastLoginAt?.toISOString() || null,
    createdAt: admin.createdAt.toISOString(),
  }));

  return (
    <EquipeClient
      initialAdmins={serializedAdmins}
      currentAdminRole={currentAdmin.role}
      currentAdminId={currentAdmin.id}
    />
  );
}
