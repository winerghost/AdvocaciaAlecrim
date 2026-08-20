import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME } from "@/lib/adminProxy";

// Só limpa o cookie local - não precisa chamar o Flask (não há sessão de
// servidor a invalidar, o token simplesmente expira sozinho).
export async function POST() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
