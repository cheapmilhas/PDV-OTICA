import { requireAdminRole } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { Shield, Users } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  SUPPORT: "Suporte",
  BILLING: "Financeiro",
};
const ROLE_STYLES: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-900/50 text-purple-400",
  ADMIN: "bg-blue-900/50 text-blue-400",
  SUPPORT: "bg-green-900/50 text-green-400",
  BILLING: "bg-yellow-900/50 text-yellow-400",
};

export default async function UsuariosAdminPage() {
  const currentAdmin = await requireAdminRole(["SUPER_ADMIN", "ADMIN"]);

  const admins = await prisma.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true, name: true, email: true, role: true,
      active: true, lastLoginAt: true, createdAt: true,
    },
  });

  const isSuperAdmin = currentAdmin.role === "SUPER_ADMIN";

  return (
    <div className="p-6 text-white">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Usuários Admin</h1>
          <p className="text-sm text-gray-400 mt-0.5">{admins.length} usuário{admins.length !== 1 ? "s" : ""} administrativo{admins.length !== 1 ? "s" : ""}</p>
        </div>
        {!isSuperAdmin && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-900/20 border border-yellow-800 text-yellow-400 text-xs">
            <Shield className="h-3.5 w-3.5" />
            Acesso limitado
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {["Usuário", "Email", "Cargo", "Status", "Último Login", "Cadastro"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <Users className="h-8 w-8 text-gray-700 mx-auto mb-2" />
                    <p className="text-gray-600">Nenhum usuário admin</p>
                  </td>
                </tr>
              ) : admins.map((admin) => (
                <tr key={admin.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-semibold text-white flex-shrink-0">
                        {admin.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-white">{admin.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-400">{admin.email}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_STYLES[admin.role] ?? "bg-gray-800 text-gray-400"}`}>
                      <Shield className="h-3 w-3" />
                      {ROLE_LABELS[admin.role] ?? admin.role}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${admin.active ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"}`}>
                      {admin.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">
                    {admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString("pt-BR") : "Nunca"}
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">
                    {new Date(admin.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
