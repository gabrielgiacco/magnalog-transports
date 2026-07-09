import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireAcesso() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Não autorizado", status: 401 };
  const role = (session.user as any).role;
  if (!["ADMIN", "FINANCEIRO", "OPERACIONAL"].includes(role)) {
    return { error: "Acesso negado", status: 403 };
  }
  return { session };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAcesso();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const nfse = await prisma.notaServico.findUnique({
    where: { id: params.id },
    include: {
      entrega: { select: { id: true, codigo: true, razaoSocial: true, cidade: true, uf: true } },
      notaFiscal: { select: { id: true, numero: true, serie: true, emitenteRazao: true } },
      lancamentos: true,
    },
  });
  if (!nfse) return NextResponse.json({ error: "NFS-e não encontrada" }, { status: 404 });
  return NextResponse.json(nfse);
}

// Editar vínculo (entregaId, notaFiscalId)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAcesso();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  const updateData: any = {};

  if ("entregaId" in body) updateData.entregaId = body.entregaId || null;
  if ("notaFiscalId" in body) updateData.notaFiscalId = body.notaFiscalId || null;

  const nfse = await prisma.notaServico.update({
    where: { id: params.id },
    data: updateData,
    include: {
      entrega: { select: { id: true, codigo: true, razaoSocial: true } },
      notaFiscal: { select: { id: true, numero: true } },
    },
  });

  // Sincroniza entregaId no lançamento vinculado (se houver)
  if ("entregaId" in body) {
    await prisma.lancamentoFinanceiro.updateMany({
      where: { notaServicoId: params.id, origem: "NOTA_SERVICO" },
      data: { entregaId: updateData.entregaId },
    });
  }

  return NextResponse.json(nfse);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAcesso();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Remove lançamento associado
  await prisma.lancamentoFinanceiro.deleteMany({
    where: { notaServicoId: params.id, origem: "NOTA_SERVICO" },
  });

  await prisma.notaServico.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
