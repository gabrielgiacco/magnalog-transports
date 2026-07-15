import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { upsertLancamentoAutomatico, removeLancamentoAutomatico } from "@/lib/financeiro";

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

  const diaria = await prisma.diaria.findUnique({
    where: { id: params.id },
    include: {
      entrega: { select: { id: true, codigo: true, razaoSocial: true, cidade: true, uf: true, dataAgendada: true } },
      lancamentos: true,
    },
  });
  if (!diaria) return NextResponse.json({ error: "Diária não encontrada" }, { status: 404 });
  return NextResponse.json(diaria);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAcesso();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();

  const atual = await prisma.diaria.findUnique({ where: { id: params.id } });
  if (!atual) return NextResponse.json({ error: "Diária não encontrada" }, { status: 404 });

  const data: any = {};
  if ("motivo" in body) data.motivo = body.motivo || null;
  if ("observacoes" in body) data.observacoes = body.observacoes || null;
  if ("valor" in body) data.valor = typeof body.valor === "number" ? body.valor : parseFloat(body.valor) || 0;
  if ("formaPagamento" in body) data.formaPagamento = body.formaPagamento || null;
  if ("dataPagamento" in body) data.dataPagamento = body.dataPagamento ? new Date(body.dataPagamento) : null;

  if ("status" in body) {
    const novoStatus = body.status;
    const novoValor = "valor" in data ? data.valor : atual.valor;

    if (novoStatus === "PAGA" && novoValor <= 0) {
      return NextResponse.json({ error: "Preencha o valor antes de marcar como paga" }, { status: 400 });
    }
    data.status = novoStatus;
    if (novoStatus === "PAGA" && !data.dataPagamento) {
      data.dataPagamento = new Date();
    }
  }

  const atualizada = await prisma.diaria.update({
    where: { id: params.id },
    data,
    include: {
      entrega: { select: { id: true, codigo: true, razaoSocial: true } },
    },
  });

  // Sync com Financeiro
  if (atualizada.status === "PAGA" && atualizada.valor > 0 && atualizada.dataPagamento) {
    await upsertLancamentoAutomatico({
      origem: "DIARIA",
      tipo: "RECEITA",
      descricao: `Diária ${atualizada.numero} — ${atualizada.clienteNome}`,
      valor: atualizada.valor,
      dataPagamento: atualizada.dataPagamento,
      categoriaNome: "Armazenagem",
      subcategoriaNome: "Diária",
      formaPagamento: atualizada.formaPagamento || null,
      favorecido: atualizada.clienteNome,
      diariaId: atualizada.id,
      entregaId: atualizada.entregaId,
    });
  } else {
    // Se voltou pra PENDENTE/CANCELADA ou zerou o valor, remove o lançamento
    await removeLancamentoAutomatico("DIARIA", { diariaId: atualizada.id });
  }

  return NextResponse.json(atualizada);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAcesso();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const role = (auth.session!.user as any).role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas ADMIN pode excluir diárias" }, { status: 403 });
  }

  await removeLancamentoAutomatico("DIARIA", { diariaId: params.id });
  await prisma.diaria.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
