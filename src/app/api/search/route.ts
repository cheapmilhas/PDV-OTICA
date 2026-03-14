import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ products: [], customers: [] });
    }

    const [products, customers] = await Promise.all([
      prisma.product.findMany({
        where: {
          companyId,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
            { barcode: { contains: q, mode: "insensitive" } },
            { manufacturerCode: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          name: true,
          sku: true,
          barcode: true,
          salePrice: true,
          stockQty: true,
          type: true,
        },
        take: 5,
        orderBy: { name: "asc" },
      }),
      prisma.customer.findMany({
        where: {
          companyId,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { cpf: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          name: true,
          cpf: true,
          phone: true,
          email: true,
        },
        take: 5,
        orderBy: { name: "asc" },
      }),
    ]);

    return NextResponse.json({
      products: JSON.parse(JSON.stringify(products)),
      customers,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
