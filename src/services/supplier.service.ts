import { prisma } from "@/lib/prisma";
import type {
  CreateSupplierDTO,
  UpdateSupplierDTO,
  SupplierQuery,
} from "@/lib/validations/supplier.schema";
import {
  notFoundError,
  duplicateError,
} from "@/lib/error-handler";
import { createPaginationMeta, getPaginationParams } from "@/lib/api-response";
import type { Supplier } from "@prisma/client";

/**
 * Service de fornecedores
 * Camada de business logic para operações de Supplier
 */
export class SupplierService {
  /**
   * Lista suppliers com paginação, busca e filtros
   */
  async list(query: SupplierQuery, companyId: string) {
    const { search, page, pageSize, status, city, state, startDate, endDate, sortBy, sortOrder } = query;

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

    // Filtro de cidade
    if (city) {
      where.city = city;
    }

    // Filtro de estado (UF)
    if (state) {
      where.state = state;
    }

    // Filtro de período de cadastro
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = startDate;
      }
      if (endDate) {
        // Adiciona 23:59:59 ao endDate para incluir todo o dia
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        where.createdAt.lte = endOfDay;
      }
    }

    // Busca full-text (OR entre múltiplos campos)
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" as const } },
        { tradeName: { contains: search, mode: "insensitive" as const } },
        { cnpj: { contains: search } },
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
      prisma.supplier.findMany({
        where,
        skip,
        take,
        orderBy,
      }),
      prisma.supplier.count({ where }),
    ]);

    // Retorna dados + metadados de paginação
    return {
      data,
      pagination: createPaginationMeta(page, pageSize, total),
    };
  }

  /**
   * Busca supplier por ID
   */
  async getById(id: string, companyId: string, includeInactive = false): Promise<Supplier> {
    const where: any = { id, companyId };

    if (!includeInactive) {
      where.active = true;
    }

    const supplier = await prisma.supplier.findFirst({ where });

    if (!supplier) {
      throw notFoundError("Fornecedor não encontrado");
    }

    return supplier;
  }

  /**
   * Cria novo supplier
   */
  async create(data: CreateSupplierDTO, companyId: string): Promise<Supplier> {
    // Verifica duplicação de CNPJ (se informado)
    if (data.cnpj) {
      const existing = await prisma.supplier.findFirst({
        where: {
          companyId,
          cnpj: data.cnpj,
        },
      });

      if (existing) {
        throw duplicateError("Já existe um fornecedor com este CNPJ");
      }
    }

    // Cria supplier
    const supplier = await prisma.supplier.create({
      data: {
        ...data,
        companyId,
      },
    });

    return supplier;
  }

  /**
   * Atualiza supplier
   */
  async update(id: string, data: UpdateSupplierDTO, companyId: string): Promise<Supplier> {
    // Verifica se existe
    await this.getById(id, companyId, true);

    // Verifica duplicação de CNPJ (se estiver alterando)
    if (data.cnpj) {
      const existing = await prisma.supplier.findFirst({
        where: {
          companyId,
          cnpj: data.cnpj,
          id: { not: id },
        },
      });

      if (existing) {
        throw duplicateError("Já existe um fornecedor com este CNPJ");
      }
    }

    // Atualiza
    const supplier = await prisma.supplier.update({
      where: { id },
      data,
    });

    return supplier;
  }

  /**
   * Deleta (soft delete) supplier
   */
  async delete(id: string, companyId: string): Promise<void> {
    // Verifica se existe
    await this.getById(id, companyId, true);

    // Soft delete
    await prisma.supplier.update({
      where: { id },
      data: { active: false },
    });
  }

  /**
   * Deleta permanentemente supplier do banco de dados
   */
  async hardDelete(id: string, companyId: string): Promise<void> {
    // Verifica se existe
    await this.getById(id, companyId, true);

    // Hard delete - remove permanentemente
    await prisma.supplier.delete({
      where: { id },
    });
  }
}

// Exporta instância única (singleton)
export const supplierService = new SupplierService();
