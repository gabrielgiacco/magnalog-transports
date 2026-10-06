import { NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { listarEmbarcadoresDeAvarias } from "@/lib/avarias-relatorio";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  return NextResponse.json(await listarEmbarcadoresDeAvarias());
}
