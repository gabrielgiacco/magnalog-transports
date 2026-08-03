import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const acordo = await prisma.acordoTransportadora.findUnique({ where: { id: params.id } });
    if (!acordo) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json(acordo);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const body = await req.json();
    const data: any = {};
    if (body.transportadoraNome !== undefined) data.transportadoraNome = body.transportadoraNome;
    if (body.percentualCTE !== undefined) data.percentualCTE = Number(body.percentualCTE);
    if (body.taxaEntrega !== undefined) data.taxaEntrega = Number(body.taxaEntrega);
    if (body.valorPaleteFixo !== undefined) data.valorPaleteFixo = Number(body.valorPaleteFixo);
    if (body.observacoes !== undefined) data.observacoes = body.observacoes || null;
    const acordo = await prisma.acordoTransportadora.update({ where: { id: params.id }, data });
    return NextResponse.json(acordo);
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
    await prisma.acordoTransportadora.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
