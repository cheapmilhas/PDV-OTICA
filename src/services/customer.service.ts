import { prisma } from "@/lib/prisma";
import type {
  CreateCustomerDTO,
  UpdateCustomerDTO,
  CustomerQuery,
} from "@/lib/validations/customer.schema";
import {
  notFoundError,
  duplicateError,
} from "@/lib/error-handler";
import { createPaginationMeta, getPaginationParams } from "@/lib/api-response";
import type { Customer } from "@prisma/client";

/**
 * Service de clientes
 * Camada de business logic para operações de Customer
 */
export class CustomerService {
  /**
   * Lista clientes com paginação, busca e filtros
   *
   * @param query Parâmetros de query (page, pageSize, search, etc.)
   * @param companyId ID da empresa (multi-tenant)
   * @returns Lista paginada de clientes
   *
   * @example
   * const result = await customerService.list({ page: 1, pageSize: 20, search: "João" }, "cm_001")
   */
  async list(query: CustomerQuery, companyId: string) {
    const {
      search,
      page,
      pageSize,
      status,
      city,
      state,
      gender,
      acceptsMarketing,
      referralSource,
      startDate,
      endDate,
      birthdayMonth,
      sortBy,
      sortOrder
    } = query;

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
    // Se status === "todos", não filtra active

    // Filtro de cidade
    if (city) {
      where.city = city;
    }

    // Filtro de estado (UF)
    if (state) {
      where.state = state;
    }

    // Filtro de gênero
    if (gender) {
      where.gender = gender;
    }

    // Filtro de aceita marketing
    if (acceptsMarketing !== undefined) {
      where.acceptsMarketing = acceptsMarketing;
    }

    // Filtro de origem
    if (referralSource) {
      where.referralSource = referralSource;
    }

    // Filtro de período de cadastro
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        console.log("🔍 Filtro startDate:", startDate);
        where.createdAt.gte = startDate;
      }
      if (endDate) {
        // Adiciona 23:59:59 ao endDate para incluir todo o dia
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        console.log("🔍 Filtro endDate:", endOfDay);
        where.createdAt.lte = endOfDay;
      }
      console.log("🔍 Where createdAt final:", where.createdAt);
    }

    // Busca full-text (OR entre múltiplos campos)
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" as const } },
        { email: { contains: search, mode: "insensitive" as const } },
        { cpf: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    // Ordenação
    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    // Filtro de aniversariantes (por mês)
    // Como Prisma não suporta EXTRACT(MONTH), filtramos após buscar
    if (birthdayMonth) {
      where.birthDate = { not: null };
    }

    // Paginação
    const { skip, take } = getPaginationParams(page, pageSize);

    // Execute query + count em paralelo (performance)
    console.log("🔍 Query where completa:", JSON.stringify(where, null, 2));
    let [data, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip: birthdayMonth ? undefined : skip,
        take: birthdayMonth ? undefined : take,
        orderBy,
      }),
      prisma.customer.count({ where }),
    ]);
    console.log(`✅ Encontrados ${data.length} clientes (total: ${total})`);

    // Filtrar por mês de aniversário no JavaScript (pós-processamento)
    if (birthdayMonth) {
      data = data.filter((customer) => {
        if (!customer.birthDate) return false;
        const month = new Date(customer.birthDate).getMonth() + 1; // getMonth() retorna 0-11
        return month === birthdayMonth;
      });

      // Recalcular total e aplicar paginação manualmente
      total = data.length;
      const start = (page - 1) * pageSize;
      data = data.slice(start, start + pageSize);
    }

    // Retorna dados + metadados de paginação
    return {
      data,
      pagination: createPaginationMeta(page, pageSize, total),
    };
  }

  /**
   * Busca cliente por ID
   *
   * @param id ID do cliente
   * @param companyId ID da empresa (multi-tenant)
   * @param includeInactive Se true, retorna mesmo se inactive (para ADMIN/GERENTE)
   * @throws {AppError} 404 se cliente não encontrado
   * @returns Customer
   *
   * @example
   * const customer = await customerService.getById("cuid123", "cm_001")
   */
  async getById(id: string, companyId: string, includeInactive = false): Promise<Customer> {
    const where: any = {
      id,
      companyId,
    };

    // Se não incluir inativos, filtrar por active = true
    if (!includeInactive) {
      where.active = true;
    }

    const customer = await prisma.customer.findFirst({ where });

    if (!customer) {
      throw notFoundError("Cliente não encontrado");
    }

    return customer;
  }

  /**
   * Cria novo cliente
   *
   * @param data DTO de criação
   * @param companyId ID da empresa (multi-tenant)
   * @throws {AppError} 409 se CPF duplicado
   * @returns Customer criado
   *
   * @example
   * const customer = await customerService.create({ name: "João", cpf: "12345678901" }, "cm_001")
   */
  async create(data: CreateCustomerDTO, companyId: string): Promise<Customer> {
    // Validação: CPF duplicado (se fornecido)
    if (data.cpf) {
      const existing = await prisma.customer.findFirst({
        where: {
          companyId,
          cpf: data.cpf,
        },
      });

      if (existing) {
        throw duplicateError("CPF já cadastrado nesta empresa", "cpf");
      }
    }

    // Validação: Email duplicado (se fornecido)
    if (data.email) {
      const existing = await prisma.customer.findFirst({
        where: {
          companyId,
          email: data.email,
        },
      });

      if (existing) {
        throw duplicateError("Email já cadastrado nesta empresa", "email");
      }
    }

    // Cria cliente
    const customer = await prisma.customer.create({
      data: {
        ...data,
        companyId,
      },
    });

    return customer;
  }

  /**
   * Atualiza cliente existente
   *
   * @param id ID do cliente
   * @param data DTO de atualização
   * @param companyId ID da empresa (multi-tenant)
   * @throws {AppError} 404 se cliente não encontrado
   * @throws {AppError} 409 se CPF/email duplicado
   * @returns Customer atualizado
   *
   * @example
   * const customer = await customerService.update("cuid123", { name: "João Silva" }, "cm_001")
   */
  async update(id: string, data: UpdateCustomerDTO, companyId: string): Promise<Customer> {
    // Verifica se cliente existe e pertence à empresa
    await this.getById(id, companyId, true); // includeInactive=true para permitir editar inativos

    // Validação: CPF duplicado (se mudando CPF)
    if (data.cpf) {
      const existing = await prisma.customer.findFirst({
        where: {
          companyId,
          cpf: data.cpf,
          NOT: { id }, // Exclui o próprio cliente da busca
        },
      });

      if (existing) {
        throw duplicateError("CPF já cadastrado para outro cliente", "cpf");
      }
    }

    // Validação: Email duplicado (se mudando email)
    if (data.email) {
      const existing = await prisma.customer.findFirst({
        where: {
          companyId,
          email: data.email,
          NOT: { id },
        },
      });

      if (existing) {
        throw duplicateError("Email já cadastrado para outro cliente", "email");
      }
    }

    // Atualiza cliente
    const customer = await prisma.customer.update({
      where: { id },
      data,
    });

    return customer;
  }

  /**
   * Deleta cliente (soft delete)
   * Apenas marca como active = false
   *
   * @param id ID do cliente
   * @param companyId ID da empresa (multi-tenant)
   * @throws {AppError} 404 se cliente não encontrado
   * @returns Customer deletado
   *
   * @example
   * await customerService.softDelete("cuid123", "cm_001")
   */
  async softDelete(id: string, companyId: string): Promise<Customer> {
    // Verifica se cliente existe
    await this.getById(id, companyId, true);

    // Soft delete
    const customer = await prisma.customer.update({
      where: { id },
      data: { active: false },
    });

    return customer;
  }

  /**
   * BONUS: Busca clientes por telefone (para PDV)
   * Útil para buscar cliente rapidamente ao digitar telefone
   *
   * @param phone Telefone parcial ou completo
   * @param companyId ID da empresa
   * @returns Lista de até 10 clientes
   *
   * @example
   * const customers = await customerService.searchByPhone("98529", "cm_001")
   */
  async searchByPhone(phone: string, companyId: string): Promise<Customer[]> {
    return prisma.customer.findMany({
      where: {
        companyId,
        active: true,
        phone: { contains: phone },
      },
      take: 10,
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * BONUS: Busca clientes por CPF (para PDV)
   *
   * @param cpf CPF (com ou sem formatação)
   * @param companyId ID da empresa
   * @returns Customer ou null
   */
  async findByCPF(cpf: string, companyId: string): Promise<Customer | null> {
    // Remove formatação do CPF
    const cleanCPF = cpf.replace(/\D/g, "");

    return prisma.customer.findFirst({
      where: {
        companyId,
        active: true,
        cpf: cleanCPF,
      },
    });
  }

  /**
   * BONUS: Conta total de clientes ativos
   *
   * @param companyId ID da empresa
   * @returns Número de clientes ativos
   */
  async countActive(companyId: string): Promise<number> {
    return prisma.customer.count({
      where: {
        companyId,
        active: true,
      },
    });
  }

  /**
   * BONUS: Lista cidades únicas (para filtro)
   *
   * @param companyId ID da empresa
   * @returns Array de cidades
   */
  async listCities(companyId: string): Promise<string[]> {
    const customers = await prisma.customer.findMany({
      where: {
        companyId,
        active: true,
        city: { not: null },
      },
      select: { city: true },
      distinct: ["city"],
    });

    return customers
      .map((c) => c.city)
      .filter((city): city is string => city !== null)
      .sort();
  }
}

// Export singleton instance
export const customerService = new CustomerService();
