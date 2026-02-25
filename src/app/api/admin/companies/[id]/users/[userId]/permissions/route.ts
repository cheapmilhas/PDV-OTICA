import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; userId: string }> };

/**
 * GET /api/admin/companies/[id]/users/[userId]/permissions
 * Returns user's effective permissions: role defaults + custom overrides + all available permissions
 */
export async function GET(request: NextRequest, context: Params) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: companyId, userId } = await context.params;

  // Verify user belongs to company
  const user = await prisma.user.findFirst({
    where: { id: userId, companyId },
    select: { id: true, role: true, name: true, email: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  // Get all permissions from catalog, grouped by module
  const allPermissions = await prisma.permission.findMany({
    where: { isActive: true },
    orderBy: [{ module: "asc" }, { sortOrder: "asc" }],
    select: { id: true, code: true, name: true, module: true, category: true },
  });

  // Get role default permissions
  const rolePermissions = await prisma.rolePermission.findMany({
    where: { role: user.role },
    select: { permissionId: true, granted: true },
  });
  const rolePermissionIds = new Set(
    rolePermissions.filter((rp) => rp.granted).map((rp) => rp.permissionId)
  );

  // Get user custom permissions
  const userCustoms = await prisma.userPermission.findMany({
    where: { userId },
    select: { permissionId: true, granted: true },
  });
  const customMap = new Map(userCustoms.map((up) => [up.permissionId, up.granted]));

  // Build effective permissions and grouped result
  const grouped: Record<
    string,
    {
      module: string;
      permissions: Array<{
        id: string;
        code: string;
        name: string;
        category: string;
        fromRole: boolean;
        customOverride: boolean | null;
        effective: boolean;
      }>;
    }
  > = {};

  let effectiveCount = 0;

  for (const perm of allPermissions) {
    if (!grouped[perm.module]) {
      grouped[perm.module] = { module: perm.module, permissions: [] };
    }

    const fromRole = rolePermissionIds.has(perm.id);
    const customOverride = customMap.has(perm.id) ? customMap.get(perm.id)! : null;
    const effective = customOverride !== null ? customOverride : fromRole;

    if (effective) effectiveCount++;

    grouped[perm.module].permissions.push({
      id: perm.id,
      code: perm.code,
      name: perm.name,
      category: perm.category,
      fromRole,
      customOverride,
      effective,
    });
  }

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    modules: grouped,
    summary: {
      total: allPermissions.length,
      effective: effectiveCount,
      customOverrides: userCustoms.length,
    },
  });
}

/**
 * PUT /api/admin/companies/[id]/users/[userId]/permissions
 * Updates user role and/or custom permission overrides
 *
 * Body: {
 *   role?: string,
 *   permissions?: Array<{ code: string, granted: boolean }>
 * }
 */
export async function PUT(request: NextRequest, context: Params) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: companyId, userId } = await context.params;

  const user = await prisma.user.findFirst({
    where: { id: userId, companyId },
    select: { id: true, role: true, name: true, email: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  const body = await request.json();
  const { role, permissions } = body;

  const validRoles = ["ADMIN", "GERENTE", "VENDEDOR", "CAIXA", "ATENDENTE"];

  if (role && !validRoles.includes(role)) {
    return NextResponse.json({ error: "Cargo inválido" }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Update role if provided
      if (role && role !== user.role) {
        await tx.user.update({
          where: { id: userId },
          data: { role: role as any },
        });

        // Clear custom permissions when role changes (reset to new role defaults)
        await tx.userPermission.deleteMany({ where: { userId } });
      }

      // Apply custom permissions if provided (and role didn't change)
      if (permissions && Array.isArray(permissions) && (!role || role === user.role)) {
        for (const perm of permissions) {
          const permission = await tx.permission.findUnique({
            where: { code: perm.code },
          });
          if (!permission) continue;

          if (perm.granted === null) {
            // null means "remove override, use role default"
            await tx.userPermission.deleteMany({
              where: { userId, permissionId: permission.id },
            });
          } else {
            await tx.userPermission.upsert({
              where: {
                userId_permissionId: { userId, permissionId: permission.id },
              },
              create: {
                userId,
                permissionId: permission.id,
                granted: perm.granted,
              },
              update: {
                granted: perm.granted,
                updatedAt: new Date(),
              },
            });
          }
        }
      }

      // Audit
      await tx.globalAudit.create({
        data: {
          actorType: "ADMIN_USER",
          actorId: admin.id,
          companyId,
          action: role && role !== user.role ? "USER_ROLE_CHANGED" : "USER_PERMISSIONS_UPDATED",
          metadata: {
            userId,
            userEmail: user.email,
            ...(role && role !== user.role
              ? { fromRole: user.role, toRole: role }
              : {}),
            ...(permissions ? { permissionChanges: permissions.length } : {}),
            source: "admin_portal",
          },
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: role && role !== user.role
        ? "Cargo e permissões atualizados"
        : "Permissões atualizadas",
    });
  } catch (error) {
    console.error("[ADMIN-PERMISSIONS]", error);
    return NextResponse.json({ error: "Erro ao atualizar permissões" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/companies/[id]/users/[userId]/permissions
 * Resets all custom permissions to role defaults
 */
export async function DELETE(request: NextRequest, context: Params) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: companyId, userId } = await context.params;

  const user = await prisma.user.findFirst({
    where: { id: userId, companyId },
    select: { id: true, email: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.userPermission.deleteMany({ where: { userId } });

    await tx.globalAudit.create({
      data: {
        actorType: "ADMIN_USER",
        actorId: admin.id,
        companyId,
        action: "USER_PERMISSIONS_RESET",
        metadata: { userId, userEmail: user.email, source: "admin_portal" },
      },
    });
  });

  return NextResponse.json({
    success: true,
    message: "Permissões resetadas para o padrão do cargo",
  });
}
