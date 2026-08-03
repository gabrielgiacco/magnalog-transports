import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const fatura = await prisma.faturaTransportadora.findUnique({
      where: { id: params.id },
      include: { itens: { orderBy: { createdAt: "asc" } } },
    });
    if (!fatura) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
    return NextResponse.json(fatura);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const body = await req.json();
    const data: any = {};
    if (body.status !== undefined) data.status = body.status;
    if (body.observacoes !== undefined) data.observacoes = body.observacoes || null;
    const fatura = await prisma.faturaTransportadora.update({ where: { id: params.id }, data });
    return NextResponse.json(fatura);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const role = (session.user as any)?.role;
    if (role !== "ADMIN") return NextResponse.json({ error: "Apenas ADMIN" }, { status: 403 });
    await prisma.faturaTransportadora.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
