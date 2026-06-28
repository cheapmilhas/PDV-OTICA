import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { handleApiError } from "@/lib/error-handler";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, ROLE_PERMISSIONS_MAP } from "./catalog";

/**
 * POST /api/permissions/seed
 * Popula o catálogo de permissões e permissões padrão por role.
 *
 * SEGURANÇA (pentest 2026-06-27): `Permission` e `RolePermission` são tabelas
 * GLOBAIS (sem companyId) — o seed afeta TODOS os tenants. Antes, o guard era
 * `requireRole(["ADMIN"])` de TENANT, então qualquer dono de ótica disparava um
 * `rolePermission.deleteMany()` global e zerava as permissões de todo o SaaS.
 * Agora exige SUPER_ADMIN do portal admin, e o clear+recreate roda numa única
 * transação para não deixar janela com permissões vazias.
 *
 * O catálogo + grant por role vivem em ./catalog.ts (módulo puro, testável).
 * Os códigos DEVEM bater com o enum Permission (fonte de verdade).
 */


export async function POST() {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    if (admin.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Apenas SUPER_ADMIN" }, { status: 403 });
    }

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

    // 3. Seed role permissions (clear + recreate) — numa ÚNICA transação para
    //    nunca deixar a tabela global de RolePermission vazia entre o delete e
    //    o recreate (evita janela onde todo tenant fica sem permissões de role).
    const codeToId = new Map(
      (await prisma.permission.findMany({ select: { id: true, code: true } })).map(
        (p) => [p.code, p.id] as const
      )
    );

    const rolePermissionRows = Object.entries(ROLE_PERMISSIONS_MAP).flatMap(
      ([role, permissionCodes]) =>
        permissionCodes
          .map((code) => codeToId.get(code))
          .filter((id): id is string => Boolean(id))
          .map((permissionId) => ({ role, permissionId, granted: true }))
    );

    const rolePermissionsCreated = await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany();
      const result = await tx.rolePermission.createMany({ data: rolePermissionRows });
      return result.count;
    });

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
