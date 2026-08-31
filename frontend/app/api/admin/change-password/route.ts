import { NextResponse } from "next/server";
import { proxyAdmin, readJsonBody } from "@/lib/adminProxy";

export async function POST(request: Request) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Mesmo motivo do login (ver app/api/admin/login/route.ts): sem isso, o
  // rate limit de "5 per 15 minutes" do Flask em /change-password enxerga
  // sempre o IP interno do container do Next.
  const forwardedFor = request.headers.get("x-forwarded-for");

  return proxyAdmin("/api/admin/change-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(forwardedFor ? { "X-Forwarded-For": forwardedFor } : {}),
    },
    body: JSON.stringify(parsed.body),
  });
}
