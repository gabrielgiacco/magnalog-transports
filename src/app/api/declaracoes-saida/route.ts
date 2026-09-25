import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { baixarPorReferencias } from "@/lib/deposito";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const q = searchParams.get("q");

  const where: any = {};
  if (q) {
    where.OR = [
      { codigo: { contains: q, mode: "insensitive" } },
      { motoristaNome: { contains: q, mode: "insensitive" } },
      { placa: { contains: q, mode: "insensitive" } },
      { transportadora: { contains: q, mode: "insensitive" } },
    ];
  }

  const [declaracoes, total] = await Promise.all([
    prisma.declaracaoSaida.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        emitidoPor: { select: { id: true, name: true } },
        _count: { select: { itens: true } },
      },
    }),
    prisma.declaracaoSaida.count({ where }),
  ]);

  return NextResponse.json({ declaracoes, total, pages: Math.ceil(total / limit) });
}

/**
 * Gera o próximo código a partir do MAIOR existente.
 * Não usa count() porque apagar um registro faria o código repetir.
 */
async function proximoCodigo(tx: any) {
  const ultima = await tx.declaracaoSaida.findFirst({
    orderBy: { codigo: "desc" },
    select: { codigo: true },
  });
  const n = ultima ? parseInt(ultima.codigo.slice(3), 10) + 1 : 1;
  return `DS-${String(n).padStart(5, "0")}`;
}

export async function POST(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;
  const session = auth.session;
  const userId = (session.user as any).id || (session.user as any).userId;

  const body = await req.json();
  const { transportadora, motoristaNome, motoristaCpf, placa, observacoes, itens } = body;

  if (!transportadora || !motoristaNome || !placa) {
    return NextResponse.json({ error: "Transportadora, motorista e placa são obrigatórios" }, { status: 400 });
  }
  if (!Array.isArray(itens) || itens.length === 0) {
    return NextResponse.json({ error: "Selecione ao menos um item" }, { status: 400 });
  }

  // Monta o snapshot no servidor, lendo cada origem. O cliente manda só os ids
  // para não conseguir forjar valor impresso.
  const avariaIds = itens.filter((i: any) => i.origem === "AVARIA").map((i: any) => i.refId);
  const devolucaoIds = itens.filter((i: any) => i.origem === "DEVOLUCAO").map((i: any) => i.refId);
  const ocorrenciaIds = itens.filter((i: any) => i.origem === "OCORRENCIA").map((i: any) => i.refId);

  const [avarias, devolucoes, ocorrencias] = await Promise.all([
    avariaIds.length
      ? prisma.avaria.findMany({
          where: { id: { in: avariaIds } },
          select: { id: true, codigo: true, descricao: true, valorPrejuizo: true, produtos: { select: { quantidadeAvaria: true } } },
        })
      : [],
    devolucaoIds.length
      ? prisma.notaDevolucao.findMany({
          where: { id: { in: devolucaoIds } },
          select: { id: true, numero: true, emitenteRazao: true, valorNota: true },
        })
      : [],
    ocorrenciaIds.length
      ? prisma.ocorrencia.findMany({
          where: { id: { in: ocorrenciaIds } },
          select: { id: true, tipo: true, descricao: true, entrega: { select: { codigo: true } } },
        })
      : [],
  ]);

  const linhas: any[] = [
    ...avarias.map((a) => ({
      origem: "AVARIA" as const,
      avariaId: a.id,
      referencia: a.codigo,
      descricao: a.descricao,
      quantidade: a.produtos.reduce((s, p) => s + (p.quantidadeAvaria || 0), 0) || null,
      valor: a.valorPrejuizo || 0,
    })),
    ...devolucoes.map((d) => ({
      origem: "DEVOLUCAO" as const,
      notaDevolucaoId: d.id,
      referencia: `NF ${d.numero}`,
      descricao: d.emitenteRazao,
      quantidade: null,
      valor: d.valorNota || 0,
    })),
    ...ocorrencias.map((o) => ({
      origem: "OCORRENCIA" as const,
      ocorrenciaId: o.id,
      referencia: o.entrega?.codigo || "—",
      descricao: `${o.tipo} — ${o.descricao}`,
      quantidade: null,
      valor: 0,
    })),
  ];

  if (linhas.length === 0) {
    return NextResponse.json({ error: "Nenhum item encontrado para os ids enviados" }, { status: 400 });
  }

  const valorTotal = linhas.reduce((s, l) => s + (l.valor || 0), 0);

  try {
    const criada = await prisma.$transaction(async (tx) => {
      const declaracao = await tx.declaracaoSaida.create({
        data: {
          codigo: await proximoCodigo(tx),
          transportadora,
          motoristaNome,
          motoristaCpf: motoristaCpf || null,
          placa,
          observacoes: observacoes || null,
          valorTotal,
          emitidoPorId: userId,
          itens: { create: linhas },
        },
        include: { itens: true },
      });

      // Só devolução tem status de saída. Avaria e ocorrência não mudam:
      // sair do CD não significa que a pendência foi resolvida.
      if (devolucaoIds.length) {
        await tx.notaDevolucao.updateMany({
          where: { id: { in: devolucaoIds } },
          data: {
            status: "RETIRADO",
            dataRetirada: new Date(),
            responsavel: motoristaNome,
          },
        });
      }

      // Emitir a declaração é uma das formas de dar baixa no depósito. Fecha
      // os itens ligados a estas devoluções/avarias, dentro da MESMA transação
      // — se falhar, a declaração também não sai, em vez de ficar meia
      // aplicada. Item de depósito inexistente é o caso normal de tudo que é
      // anterior a este módulo: o helper devolve 0, não lança.
      await baixarPorReferencias(tx, {
        notaDevolucaoIds: devolucaoIds,
        avariaIds,
        motivo: "RETIRADO_EMBARCADOR",
        documento: declaracao.codigo,
        responsavel: motoristaNome,
        usuarioId: userId,
      });

      return declaracao;
    });

    return NextResponse.json(criada, { status: 201 });
  } catch (e: any) {
    console.error("[declaracao-saida] erro ao criar:", e);
    return NextResponse.json({ error: e?.message || "Erro ao criar declaração" }, { status: 500 });
  }
}
