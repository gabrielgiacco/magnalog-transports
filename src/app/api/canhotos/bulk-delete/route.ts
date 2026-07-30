import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/r2";

export const dynamic = "force-dynamic";

const TIPOS_CANHOTO = ["CANHOTO", "CANHOTO_DESCARGA"] as const;
const TIPOS_DESCARGA = ["DESCARGA", "CANHOTO_DESCARGA"] as const;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const role = (session.user as any)?.role;
    if (role !== "ADMIN") return NextResponse.json({ error: "Apenas ADMIN" }, { status: 403 });

    const body = await req.json();
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: any) => typeof x === "string") : [];
    if (ids.length === 0) return NextResponse.json({ error: "ids vazio" }, { status: 400 });

    const alvos = await prisma.anexoEntrega.findMany({
      where: { id: { in: ids } },
      select: { id: true, objectKey: true, size: true, entregaId: true, tipo: true },
    });

    const erros: string[] = [];
    let bytesLiberados = 0;

    for (const a of alvos) {
      try {
        await deleteObject(a.objectKey);
      } catch (e: any) {
        // objeto pode já ter sumido do R2; log warn e prossegue com delete do DB
        erros.push(`R2 ${a.id}: ${e?.message || "erro"}`);
      }
      bytesLiberados += a.size || 0;
    }

    await prisma.anexoEntrega.deleteMany({ where: { id: { in: alvos.map((a) => a.id) } } });

    // Reset statusCanhoto/statusCanhotoCompl para entregas que ficaram sem anexos do tipo
    const entregaIds = Array.from(new Set(alvos.map((a) => a.entregaId)));
    for (const entregaId of entregaIds) {
      const [temCanhoto, temDescarga] = await Promise.all([
        prisma.anexoEntrega.count({ where: { entregaId, tipo: { in: TIPOS_CANHOTO as any } } }),
        prisma.anexoEntrega.count({ where: { entregaId, tipo: { in: TIPOS_DESCARGA as any } } }),
      ]);
      const patch: any = {};
      if (temCanhoto === 0) patch.statusCanhoto = "PENDENTE";
      if (temDescarga === 0) patch.statusCanhotoCompl = "PENDENTE";
      if (Object.keys(patch).length > 0) {
        await prisma.entrega.update({ where: { id: entregaId }, data: patch }).catch(() => {});
      }
    }

    return NextResponse.json({
      deletados: alvos.length,
      bytesLiberados,
      erros,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
