import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { logFromRequest } from "@/lib/audit";
import { darBaixa, estornarBaixa } from "@/lib/deposito";
import type { MotivoBaixaDeposito } from "@prisma/client";

const MOTIVOS: MotivoBaixaDeposito[] = [
  "REEXPEDIDO",
  "DEVOLVIDO_EMBARCADOR",
  "RETIRADO_EMBARCADOR",
  "DESCARTE",
];

// Dar baixa (total ou parcial). Toda a regra — saldo, virada pra BAIXADO,
// espelho em NotaDevolucao — mora em darBaixa (src/lib/deposito.ts); aqui so
// valida entrada e traduz {ok:false} em resposta HTTP.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const body = await req.json();
  if (!MOTIVOS.includes(body.motivo)) {
    return NextResponse.json({ error: "Motivo de baixa inválido" }, { status: 400 });
  }

  const resultado = await darBaixa(prisma, {
    itemId: params.id,
    motivo: body.motivo,
    volumes: body.volumes !== undefined ? Number(body.volumes) : undefined,
    responsavel: body.responsavel ?? null,
    documento: body.documento ?? null,
    dataSaida: body.dataSaida ? new Date(body.dataSaida) : null,
    observacoes: body.observacoes ?? null,
    usuarioId: auth.user.id,
  });

  // Conflito de estado (saldo, item ja baixado), nao entrada invalida.
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.erro }, { status: 409 });
  }

  await logFromRequest(req, "OUTRO", {
    user: { id: auth.user.id, email: auth.user.email, name: auth.user.nome, role: auth.user.role },
    recursoTipo: "deposito",
    recursoId: resultado.item.id,
    recursoDesc: resultado.item.codigo,
    detalhes: { acao: "baixa", motivo: body.motivo, volumes: body.volumes },
  });

  return NextResponse.json(resultado.item);
}

// Estorno LIFO da ultima baixa nao desfeita. Regra mora em estornarBaixa.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApi(["ADMIN", "OPERACIONAL"]);
  if (!auth.ok) return auth.response;

  const resultado = await estornarBaixa(prisma, params.id, auth.user.id);
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.erro }, { status: 409 });
  }

  await logFromRequest(req, "OUTRO", {
    user: { id: auth.user.id, email: auth.user.email, name: auth.user.nome, role: auth.user.role },
    recursoTipo: "deposito",
    recursoId: resultado.item.id,
    recursoDesc: resultado.item.codigo,
    detalhes: { acao: "estorno" },
  });

  return NextResponse.json(resultado.item);
}
