import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import type {
  CreateUserDTO,
  UpdateUserDTO,
  UserQuery,
} from "@/lib/validations/user.schema";
import {
  notFoundError,
  duplicateError,
} from "@/lib/error-handler";
import { createPaginationMeta, getPaginationParams } from "@/lib/api-response";
import type { User } from "@prisma/client";

/**
 * Service de usuários/funcionários
 * Camada de business logic para operações de User
 */
export class UserService {
  /**
   * Lista usuários com paginação, busca e filtros
   */
  async list(query: UserQuery, companyId: string) {
    const { search, page, pageSize, status, role, sortBy, sortOrder } = query;

    // Build where clause
    const where: any = {
      companyId,
    };

    // Filtro de status (active/inactive/all)
    if (status === "ativos") {
      where.active = true;
    } else if (status === "inativos") {
      where.active = false;
    }

    // Filtro por role
    if (role) {
      where.role = role;
    }

    // Busca full-text (OR entre múltiplos campos)
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" as const } },
        { email: { contains: search, mode: "insensitive" as const } },
      ];
    }

    // Ordenação
    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    // Paginação
    const { skip, take } = getPaginationParams(page, pageSize);

    // Execute query + count em paralelo (performance)
    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        orderBy,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
          defaultCommissionPercent: true,
          createdAt: true,
          updatedAt: true,
          // Não retornar passwordHash por segurança
        },
      }),
      prisma.user.count({ where }),
    ]);

    // Retorna dados + metadados de paginação
    return {
      data,
      pagination: createPaginationMeta(page, pageSize, total),
    };
  }

  /**
   * Busca usuário por ID
   */
  async getById(id: string, companyId: string, includeInactive = false) {
    const where: any = { id, companyId };

    if (!includeInactive) {
      where.active = true;
    }

    const user = await prisma.user.findFirst({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        defaultCommissionPercent: true,
        createdAt: true,
        updatedAt: true,
        // Não retornar passwordHash por segurança
      },
    });

    if (!user) {
      throw notFoundError("Usuário não encontrado");
    }

    return user;
  }

  /**
   * Cria novo usuário
   */
  async create(data: CreateUserDTO, companyId: string) {
    // Verifica duplicação de email
    const existing = await prisma.user.findFirst({
      where: {
        email: data.email,
      },
    });

    if (existing) {
      throw duplicateError("Já existe um usuário com este email");
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(data.password, 10);

    // Cria usuário (remove password do data e adiciona passwordHash)
    const { password, ...userData } = data;
    const user = await prisma.user.create({
      data: {
        ...userData,
        passwordHash,
        companyId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        defaultCommissionPercent: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  /**
   * Atualiza usuário
   */
  async update(id: string, data: UpdateUserDTO, companyId: string) {
    // Verifica se existe
    await this.getById(id, companyId, true);

    // Verifica duplicação de email (se estiver alterando)
    if (data.email) {
      const existing = await prisma.user.findFirst({
        where: {
          email: data.email,
          id: { not: id },
        },
      });

      if (existing) {
        throw duplicateError("Já existe um usuário com este email");
      }
    }

    // Se está atualizando a senha, faz hash
    let updateData: any = { ...data };
    if (data.password) {
      const { password, ...rest } = data;
      updateData = {
        ...rest,
        passwordHash: await bcrypt.hash(password, 10),
      };
    }

    // Atualiza
    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        defaultCommissionPercent: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  /**
   * Deleta (soft delete) usuário
   */
  async delete(id: string, companyId: string): Promise<void> {
    // Verifica se existe
    await this.getById(id, companyId, true);

    // Soft delete
    await prisma.user.update({
      where: { id },
      data: { active: false },
    });
  }

  /**
   * Deleta permanentemente usuário do banco de dados
   */
  async hardDelete(id: string, companyId: string): Promise<void> {
    // Verifica se existe
    await this.getById(id, companyId, true);

    // Hard delete - remove permanentemente
    await prisma.user.delete({
      where: { id },
    });
  }
}

// Exporta instância única (singleton)
export const userService = new UserService();
