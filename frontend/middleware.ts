import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/lib/adminConstants";

// Gate rápido de borda: só checa se o cookie existe, antes de qualquer
// página do painel renderizar. Cookie presente != token válido - a
// validação real acontece em app/admin/layout.tsx via GET /api/admin/me.
export function middleware(request: NextRequest) {
  if (!request.cookies.has(ADMIN_COOKIE_NAME)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
