import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, ROLE_PERMISSIONS_MAP } from "./catalog";

/**
 * POST /api/permissions/seed
 * Popula o catálogo de permissões e permissões padrão por role.
 * Apenas ADMIN pode executar.
 *
 * IMPORTANTE: O catálogo + grant por role vivem em ./catalog.ts (módulo puro,
 * testável). Os códigos DEVEM bater com o enum Permission (fonte de verdade).
 */


export async function POST() {
  try {
    await requireRole(["ADMIN"]);

    // 1. Desativar permissões antigas que não estão mais no catálogo
    const validCodes = PERMISSIONS.map(p => p.code);
    await prisma.permission.updateMany({
      where: { code: { notIn: validCodes } },
      data: { isActive: false },
    });

    // 2. Seed permission catalog (upsert)
    let created = 0;
    let updated = 0;

    for (const perm of PERMISSIONS) {
      const existing = await prisma.permission.findUnique({
        where: { code: perm.code },
      });

      if (existing) {
        await prisma.permission.update({
          where: { code: perm.code },
          data: {
            name: perm.name,
            description: perm.description,
            module: perm.module,
            category: perm.category,
            sortOrder: perm.sortOrder,
            isActive: true,
          },
        });
        updated++;
      } else {
        await prisma.permission.create({ data: { ...perm, isActive: true } });
        created++;
      }
    }

    // 3. Seed role permissions (clear + recreate)
    await prisma.rolePermission.deleteMany();

    let rolePermissionsCreated = 0;

    for (const [role, permissionCodes] of Object.entries(ROLE_PERMISSIONS_MAP)) {
      for (const code of permissionCodes) {
        const permission = await prisma.permission.findUnique({
          where: { code },
        });

        if (!permission) continue;

        await prisma.rolePermission.create({
          data: {
            role,
            permissionId: permission.id,
            granted: true,
          },
        });

        rolePermissionsCreated++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Permissões configuradas com sucesso`,
      data: {
        permissions: { created, updated, total: PERMISSIONS.length },
        rolePermissions: { created: rolePermissionsCreated },
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
