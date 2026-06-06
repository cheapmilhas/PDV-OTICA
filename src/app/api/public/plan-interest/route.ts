import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  planSlug: z.string().min(1),
  name: z.string().min(1).max(120),
  email: z.string().email(),
  phone: z.string().max(40).optional(),
  companyName: z.string().max(160).optional(),
});

export async function POST(request: Request) {
  let data;
  try {
    data = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  await prisma.planInterest.upsert({
    where: { email_planSlug: { email: data.email, planSlug: data.planSlug } },
    update: { name: data.name, phone: data.phone, companyName: data.companyName },
    create: data,
  });

  return NextResponse.json({ success: true });
}
