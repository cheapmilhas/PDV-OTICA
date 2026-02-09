import { prisma } from "@/lib/prisma";

export interface UserEffectivePermissions {
  role: string;
  rolePermissions: string[]; // Permissões padrão do role
  customPermissions: Array<{
    code: string;
    granted: boolean; // true = adicionada, false = removida
  }>;
  effectivePermissions: string[]; // Permissões finais (role + custom)
}

export class PermissionService {
  /**
   * Retorna todas as permissões efetivas de um usuário
   * (permissões do role + customizações individuais)
   */
  async getUserEffectivePermissions(
    userId: string
  ): Promise<UserEffectivePermissions> {
    // 1. Buscar usuário com role
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) {
      throw new Error("Usuário não encontrado");
    }

    // 2. Buscar permissões padrão do role
    const rolePermissions = await prisma.rolePermission.findMany({
      where: {
        role: user.role,
        granted: true,
      },
      include: {
        permission: {
          select: { code: true },
        },
      },
    });

    const rolePermissionCodes = rolePermissions.map((rp) => rp.permission.code);

    // 3. Buscar permissões customizadas do usuário
    const userCustoms = await prisma.userPermission.findMany({
      where: { userId },
      include: {
        permission: {
          select: { code: true },
        },
      },
    });

    // 4. Aplicar customizações
    const effective = new Set(rolePermissionCodes);

    const customPermissions = userCustoms.map((up) => ({
      code: up.permission.code,
      granted: up.granted,
    }));

    userCustoms.forEach((custom) => {
      if (custom.granted) {
        // Adicionar permissão
        effective.add(custom.permission.code);
      } else {
        // Remover permissão
        effective.delete(custom.permission.code);
      }
    });

    return {
      role: user.role,
      rolePermissions: rolePermissionCodes,
      customPermissions,
      effectivePermissions: Array.from(effective).sort(),
    };
  }

  /**
   * Verifica se um usuário tem uma permissão específica
   */
  async userHasPermission(
    userId: string,
    permissionCode: string
  ): Promise<boolean> {
    const { effectivePermissions } =
      await this.getUserEffectivePermissions(userId);

    return effectivePermissions.includes(permissionCode);
  }

  /**
   * Adiciona ou remove permissão customizada de um usuário
   */
  async setUserPermission(
    userId: string,
    permissionCode: string,
    granted: boolean,
    grantedByUserId?: string
  ): Promise<void> {
    // 1. Buscar permissão no catálogo
    const permission = await prisma.permission.findUnique({
      where: { code: permissionCode },
    });

    if (!permission) {
      throw new Error(`Permissão não encontrada: ${permissionCode}`);
    }

    // 2. Upsert (criar ou atualizar)
    await prisma.userPermission.upsert({
      where: {
        userId_permissionId: {
          userId,
          permissionId: permission.id,
        },
      },
      create: {
        userId,
        permissionId: permission.id,
        granted,
        grantedByUserId,
      },
      update: {
        granted,
        grantedByUserId,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Remove uma permissão customizada
   * (volta ao padrão do role)
   */
  async removeUserPermission(
    userId: string,
    permissionCode: string
  ): Promise<void> {
    const permission = await prisma.permission.findUnique({
      where: { code: permissionCode },
    });

    if (!permission) {
      return; // Permissão não existe, nada a fazer
    }

    await prisma.userPermission.deleteMany({
      where: {
        userId,
        permissionId: permission.id,
      },
    });
  }

  /**
   * Reseta todas as permissões customizadas do usuário
   * (volta ao padrão do role)
   */
  async resetUserPermissionsToDefault(userId: string): Promise<void> {
    await prisma.userPermission.deleteMany({
      where: { userId },
    });
  }

  /**
   * Lista todas as permissões do catálogo
   */
  async getAllPermissions() {
    return await prisma.permission.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    });
  }

  /**
   * Lista permissões agrupadas por módulo
   */
  async getPermissionsByModule() {
    const permissions = await this.getAllPermissions();

    const grouped = permissions.reduce((acc, perm) => {
      if (!acc[perm.module]) {
        acc[perm.module] = [];
      }

      acc[perm.module].push({
        code: perm.code,
        name: perm.name,
        description: perm.description,
        module: perm.module,
        category: perm.category,
      });

      return acc;
    }, {} as Record<string, any>);

    return grouped;
  }

  /**
   * Adiciona múltiplas permissões de uma vez
   */
  async setMultipleUserPermissions(
    userId: string,
    permissions: Array<{ code: string; granted: boolean }>,
    grantedByUserId?: string
  ): Promise<void> {
    for (const perm of permissions) {
      await this.setUserPermission(
        userId,
        perm.code,
        perm.granted,
        grantedByUserId
      );
    }
  }
}
