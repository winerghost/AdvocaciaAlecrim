import { NextResponse } from "next/server";
import { proxyAdmin, readJsonBody } from "@/lib/adminProxy";

export async function GET() {
  return proxyAdmin("/api/admin/users");
}

export async function POST(request: Request) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Mesmo motivo do login: o rate limit do Flask precisa do IP real.
  const forwardedFor = request.headers.get("x-forwarded-for");

  return proxyAdmin("/api/admin/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(forwardedFor ? { "X-Forwarded-For": forwardedFor } : {}),
    },
    body: JSON.stringify(parsed.body),
  });
}
