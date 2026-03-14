import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth-helpers";
import { auth } from "@/auth";

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
            email: row.email,
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
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : "Unknown error";
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
    console.error("Error importing customers:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Erro ao importar clientes." } },
      { status: 500 }
    );
  }
}
