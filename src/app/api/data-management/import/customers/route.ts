import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth-helpers";
import { validateBranchOwnership } from "@/lib/validate-branch";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "data-management/import/customers" });

interface CustomerRow {
  name: string;
  phone: string | null;
  cpf: string | null;
  rg: string | null;
  email: string | null;
  birthDate: string | null;
  gender: string | null;
  address: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  notes: string | null;
  externalId: string | null;
  branchId: string;
  createdAt: string | null;
  extraPhones: { value: string; label: string }[];
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Apenas administradores podem importar dados." } },
        { status: 403 }
      );
    }

    const companyId = await getCompanyId();
    const body = await req.json();
    const { customers } = body as { customers: CustomerRow[] };

    if (!customers || !Array.isArray(customers) || customers.length === 0) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Nenhum cliente para importar." } },
        { status: 400 }
      );
    }

    // Segurança multi-tenant: validar todas as branchIds antes da importação
    const uniqueBranchIds = Array.from(
      new Set(
        customers
          .filter((c) => c.branchId && c.extraPhones && c.extraPhones.length > 0)
          .map((c) => c.branchId)
      )
    );
    for (const branchId of uniqueBranchIds) {
      await validateBranchOwnership(branchId, companyId);
    }

    let imported = 0;
    let duplicates = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    // Process in chunks to avoid overwhelming the DB
    for (const row of customers) {
      try {
        // Check for duplicates by phone or CPF
        if (row.phone || row.cpf) {
          const existing = await prisma.customer.findFirst({
            where: {
              companyId,
              OR: [
                ...(row.phone ? [{ phone: row.phone }] : []),
                ...(row.cpf ? [{ cpf: row.cpf }] : []),
              ],
            },
            select: { id: true },
          });

          if (existing) {
            duplicates++;
            continue;
          }
        }

        // Create the customer
        const customer = await prisma.customer.create({
          data: {
            companyId,
            name: row.name,
            phone: row.phone,
            cpf: row.cpf,
            rg: row.rg,
            // M7: normaliza email (trim+lowercase; vazio→null) p/ casar com o
            // índice único parcial Customer_companyId_email_unique.
            email: row.email ? row.email.trim().toLowerCase() || null : null,
            birthDate: row.birthDate ? new Date(row.birthDate) : null,
            gender: row.gender,
            address: row.address,
            number: row.number,
            complement: row.complement,
            neighborhood: row.neighborhood,
            city: row.city,
            state: row.state,
            zipCode: row.zipCode,
            notes: row.notes,
            externalId: row.externalId,
            createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
          },
        });

        // Create extra phone contacts
        if (row.extraPhones && row.extraPhones.length > 0) {
          for (const phone of row.extraPhones) {
            // Find the branch for this customer's store
            await prisma.customerContact.create({
              data: {
                customerId: customer.id,
                branchId: row.branchId,
                type: "CUSTOM",
                channel: "PHONE",
                status: "CONFIRMED",
                message: phone.value,
                notes: phone.label,
              },
            });
          }
        }

        imported++;
      } catch (err: any) {
        errors++;
        // M7: P2002 (unique CPF/email) com mensagem amigável — não vaza o nome
        // interno da constraint do Prisma na resposta.
        const msg =
          err?.code === "P2002"
            ? "CPF, CNPJ ou email já pertence a outro cliente nesta empresa"
            : err instanceof Error
              ? err.message
              : "Unknown error";
        if (errorDetails.length < 20) {
          errorDetails.push(`${row.name}: ${msg}`);
        }
      }
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        companyId,
        userId: session.user.id,
        action: "IMPORT_CUSTOMERS",
        entityType: "Customer",
        entityId: "bulk",
        newData: {
          imported,
          duplicates,
          errors,
          totalSent: customers.length,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({ imported, duplicates, errors, errorDetails });
  } catch (error) {
    log.error("Erro ao importar clientes", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Erro ao importar clientes." } },
      { status: 500 }
    );
  }
}
