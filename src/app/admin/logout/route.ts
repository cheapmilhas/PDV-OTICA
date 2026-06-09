import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  cookieStore.delete("admin.session-token");
  const origin = new URL(request.url).origin;
  return NextResponse.redirect(new URL("/admin/login", origin));
}
