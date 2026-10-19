import { NextResponse } from "next/server";
import { proxyAdminBinary } from "@/lib/adminProxy";

// Só o FORMATO do nome, para o segmento não alcançar outro caminho do Flask
// (`..`, barras codificadas). Quem decide se o arquivo existe e quem pode
// vê-lo é o Flask.
const AVATAR_NAME = /^[a-f0-9]{32}\.webp$/;

type RouteContext = { params: Promise<{ filename: string }> };

// Foto de perfil: exige login (o cookie vira Bearer em proxyAdminBinary),
// por isso não passa pela rota pública /api/media.
export async function GET(_request: Request, { params }: RouteContext) {
  const { filename } = await params;
  if (!AVATAR_NAME.test(filename)) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return proxyAdminBinary(`/api/admin/avatars/${filename}`);
}
