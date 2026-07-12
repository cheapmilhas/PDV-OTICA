import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { parseProductContext, PRODUCT_COOKIE } from "@/lib/admin-product-context";

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const product = parseProductContext(body?.product);

  const res = NextResponse.json({ product });
  res.cookies.set(PRODUCT_COOKIE, product, {
    httpOnly: true,
    sameSite: "lax",
    path: "/admin",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
