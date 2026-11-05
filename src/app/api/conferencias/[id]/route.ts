import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi } from "@/lib/api-auth";
import { acharItemDaLeitura, compararItem, gtin14 } from "@/lib/conferencia";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

// Tira o que revelaria o esperado (conferencia cega)
function semEsperado<T extends { qtdEsperada: number; valorUnitario: number }>(item: T) {
  const { qtdEsperada, valorUnitario, ...resto } = item;
  return resto;
}

const erro = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const conf = await prisma.conferencia.findUnique({
    where: { id: params.id },
    include: {
      rota: { select: { codigo: true, motorista: { select: { nome: true } }, veiculo: { select: { placa: true } } } },
      itens: { orderBy: [{ entregaId: "asc" }, { nfNumero: "asc" }, { descricao: "asc" }] },
    },
  });
  if (!conf) return erro("Conferência não encontrada", 404);

  const entregaIds = Array.from(new Set(conf.itens.map((i) => i.entregaId).filter((x): x is string => !!x)));
  const entregas = entregaIds.length
    ? await prisma.entrega.findMany({ where: { id: { in: entregaIds } }, select: { id: true, razaoSocial: true } })
    : [];
  const entregasMap: Record<string, string> = {};
  for (const e of entregas) entregasMap[e.id] = e.razaoSocial;

  const cega = conf.status === "EM_ANDAMENTO";
  const { itens, rota, ...base } = conf;
  return NextResponse.json({
    ...base,
    rota: { codigo: rota.codigo, motorista: rota.motorista?.nome ?? null, placa: rota.veiculo?.placa ?? null },
    entregas: entregasMap,
    itens: itens.map((i) => (cega ? semEsperado(i) : { ...i, resultado: compararItem(i) })),
  });
}

// Uma leitura do leitor de codigo de barras
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const codigo = String(body.codigo ?? "").trim();
  const quantidade = body.quantidade === undefined ? 1 : Number(body.quantidade);
  if (!codigo) return erro("Código inválido", 400);
  if (!Number.isFinite(quantidade) || quantidade <= 0) return erro("Quantidade inválida", 400);

  const conf = await prisma.conferencia.findUnique({ where: { id: params.id }, select: { status: true } });
  if (!conf) return erro("Conferência não encontrada", 404);
  if (conf.status !== "EM_ANDAMENTO") return erro("Conferência já finalizada", 400);

  const itens = await prisma.conferenciaItem.findMany({ where: { conferenciaId: params.id }, orderBy: { createdAt: "asc" } });
  const achado = acharItemDaLeitura(itens, codigo);
  if (achado) {
    const item = await prisma.conferenciaItem.update({ where: { id: achado.id }, data: { qtdConferida: { increment: quantidade } } });
    return NextResponse.json({ item: semEsperado(item), foraDaCarga: false });
  }

  const ean = gtin14(codigo) ?? codigo;
  const fora = itens.find((i) => i.foraDaCarga && i.ean === ean);
  const item = fora
    ? await prisma.conferenciaItem.update({ where: { id: fora.id }, data: { qtdConferida: { increment: quantidade } } })
    : await prisma.conferenciaItem.create({
        data: {
          conferenciaId: params.id,
          foraDaCarga: true,
          codigoProduto: codigo,
          descricao: "Código não pertence à carga",
          ean,
          qtdConferida: quantidade,
          qtdEsperada: 0,
        },
      });
  return NextResponse.json({ item: semEsperado(item), foraDaCarga: true });
}

// Ajuste manual de um item (contagem, avaria, observacao)
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  if (!itemId) return erro("itemId obrigatório", 400);

  const conf = await prisma.conferencia.findUnique({ where: { id: params.id }, select: { status: true } });
  if (!conf) return erro("Conferência não encontrada", 404);
  if (conf.status !== "EM_ANDAMENTO") return erro("Conferência já finalizada", 400);

  const atual = await prisma.conferenciaItem.findFirst({ where: { id: itemId, conferenciaId: params.id } });
  if (!atual) return erro("Item não encontrado", 404);

  const data: { qtdConferida?: number; qtdAvaria?: number; observacao?: string | null } = {};
  for (const campo of ["qtdConferida", "qtdAvaria"] as const) {
    if (body[campo] === undefined) continue;
    const n = Number(body[campo]);
    if (!Number.isFinite(n) || n < 0) return erro("Quantidade inválida", 400);
    data[campo] = n;
  }
  if (body.observacao !== undefined) data.observacao = body.observacao ? String(body.observacao).trim() || null : null;

  if ((data.qtdAvaria ?? atual.qtdAvaria) > (data.qtdConferida ?? atual.qtdConferida)) {
    return erro("Avaria maior que o contado", 400);
  }

  const item = await prisma.conferenciaItem.update({ where: { id: itemId }, data });
  return NextResponse.json(semEsperado(item));
}

// Desfaz uma leitura errada: so item fora da carga
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const itemId = req.nextUrl.searchParams.get("itemId");
  if (!itemId) return erro("itemId obrigatório", 400);

  const conf = await prisma.conferencia.findUnique({ where: { id: params.id }, select: { status: true } });
  if (!conf) return erro("Conferência não encontrada", 404);
  if (conf.status !== "EM_ANDAMENTO") return erro("Conferência já finalizada", 400);

  const item = await prisma.conferenciaItem.findFirst({ where: { id: itemId, conferenciaId: params.id } });
  if (!item) return erro("Item não encontrado", 404);
  if (!item.foraDaCarga) return erro("Só itens fora da carga podem ser removidos", 400);

  await prisma.conferenciaItem.delete({ where: { id: itemId } });
  return NextResponse.json({ ok: true });
}
