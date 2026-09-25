import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { logFromRequest } from "@/lib/audit";
import { diasParados } from "@/lib/deposito";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const item = await prisma.depositoItem.findUnique({
    where: { id: params.id },
    include: {
      registradoPor: { select: { name: true } },
      baixadoPor: { select: { name: true } },
      movimentos: {
        orderBy: { createdAt: "desc" },
        include: { usuario: { select: { name: true } } },
      },
    },
  });
  if (!item) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  return NextResponse.json({
    ...item,
    diasParados: diasParados(item.dataEntrada, item.dataSaida),
    saldo: item.volumes - item.volumesBaixados,
  });
}

// Campos editaveis aqui. status, volumesBaixados, motivoBaixa, dataSaida,
// codigo, origem e os ids de origem pertencem ao fluxo de baixa (darBaixa /
// estornarBaixa em src/lib/deposito.ts) — PATCH nunca toca neles.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const existente = await prisma.depositoItem.findUnique({ where: { id: params.id } });
  if (!existente) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const body = await req.json();
  const data: any = {};

  if (body.descricao !== undefined) data.descricao = body.descricao;
  if (body.volumes !== undefined) {
    const v = Number(body.volumes);
    if (!Number.isFinite(v) || v < 1) {
      return NextResponse.json({ error: "Volumes deve ser no mínimo 1" }, { status: 400 });
    }
    if (v < existente.volumesBaixados) {
      return NextResponse.json(
        { error: `Volumes não pode ficar abaixo do já baixado (${existente.volumesBaixados})` },
        { status: 400 },
      );
    }
    data.volumes = v;
  }
  if (body.pesoKg !== undefined) data.pesoKg = Number(body.pesoKg);
  if (body.valorMercadoria !== undefined) data.valorMercadoria = Number(body.valorMercadoria);
  if (body.localizacao !== undefined) data.localizacao = body.localizacao || null;
  if (body.notaNumero !== undefined) data.notaNumero = body.notaNumero || null;
  if (body.notaSerie !== undefined) data.notaSerie = body.notaSerie || null;
  if (body.notaChave !== undefined) data.notaChave = body.notaChave || null;
  if (body.observacoes !== undefined) data.observacoes = body.observacoes || null;
  if (body.embarcadorCnpj !== undefined) data.embarcadorCnpj = String(body.embarcadorCnpj).replace(/\D/g, "");
  if (body.embarcadorRazao !== undefined) data.embarcadorRazao = body.embarcadorRazao;
  if (body.tipoEntrada !== undefined) data.tipoEntrada = body.tipoEntrada;
  if (body.dataEntrada !== undefined) data.dataEntrada = new Date(body.dataEntrada);

  // Mudou volumes ou localizacao: o relatorio/conferencia precisa do rastro
  // no livro-razao, nao so do valor novo no item.
  const precisaMovimento = body.volumes !== undefined || body.localizacao !== undefined;

  const atualizado = await prisma.$transaction(async (tx) => {
    const item = await tx.depositoItem.update({ where: { id: params.id }, data });

    if (precisaMovimento) {
      const partes: string[] = [];
      if (body.volumes !== undefined) partes.push(`volumes ${existente.volumes} -> ${item.volumes}`);
      if (body.localizacao !== undefined) {
        partes.push(`localizacao "${existente.localizacao ?? "—"}" -> "${item.localizacao ?? "—"}"`);
      }
      await tx.depositoMovimento.create({
        data: {
          itemId: item.id,
          tipo: "AJUSTE",
          volumes: item.volumes,
          usuarioId: auth.user.id,
          observacoes: `Ajuste: ${partes.join("; ")}`,
        },
      });
    }

    return item;
  });

  await logFromRequest(req, "OUTRO", {
    user: { id: auth.user.id, email: auth.user.email, name: auth.user.nome, role: auth.user.role },
    recursoTipo: "deposito",
    recursoId: atualizado.id,
    recursoDesc: atualizado.codigo,
    detalhes: { acao: "editar", camposAlterados: Object.keys(data) },
  });

  return NextResponse.json({
    ...atualizado,
    diasParados: diasParados(atualizado.dataEntrada, atualizado.dataSaida),
    saldo: atualizado.volumes - atualizado.volumesBaixados,
  });
}

// So ADMIN apaga, e so quando o item nunca teve baixa — historico de baixa
// nao pode sumir.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApi(["ADMIN"]);
  if (!auth.ok) return auth.response;

  const item = await prisma.depositoItem.findUnique({ where: { id: params.id } });
  if (!item) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (item.status === "BAIXADO" || item.volumesBaixados > 0) {
    return NextResponse.json(
      { error: "Item já tem baixa registrada — histórico não pode ser apagado" },
      { status: 409 },
    );
  }

  await prisma.depositoItem.delete({ where: { id: params.id } });

  await logFromRequest(req, "OUTRO", {
    user: { id: auth.user.id, email: auth.user.email, name: auth.user.nome, role: auth.user.role },
    recursoTipo: "deposito",
    recursoId: item.id,
    recursoDesc: item.codigo,
    detalhes: { acao: "apagar" },
  });

  return NextResponse.json({ ok: true });
}
