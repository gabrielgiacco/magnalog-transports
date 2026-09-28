import { NextRequest, NextResponse } from "next/server";
import type { Prisma, TipoContaPagar } from "@prisma/client";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { logFromRequest } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIPOS_VALIDOS: TipoContaPagar[] = ["MOTORISTA", "DESCARGA", "ABASTECIMENTO", "PEDAGIO", "OUTROS"];

interface ItemValido {
  chave: string;
  tipo: TipoContaPagar;
  descricao: string;
  valor: number;
  dataVencimento: string;
  favorecido: string;
  observacoes?: string;
}

function validarItem(item: any): item is ItemValido {
  const chave = String(item?.chave || "");
  const valor = Number(item?.valor);
  return (
    /^\d{44}$/.test(chave) &&
    Number.isFinite(valor) &&
    valor >= 0 &&
    TIPOS_VALIDOS.includes(item?.tipo) &&
    typeof item?.descricao === "string" &&
    item.descricao.trim().length > 0 &&
    typeof item?.dataVencimento === "string" &&
    !isNaN(new Date(item.dataVencimento).getTime())
  );
}

/**
 * Cria contas a pagar a partir de NF-e de compra já classificadas em
 * /api/sincronizacao/classificar. Não busca nada no provedor — o cliente já
 * mandou os dados extraídos do XML; aqui só se valida e grava.
 *
 * `skipDuplicates` (apoiado no unique de `chaveAcesso`) garante que rodar a
 * sincronização de novo nunca duplica um lançamento.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApi(["ADMIN", "FINANCEIRO"]);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const itensBrutos: unknown[] = Array.isArray(body?.itens) ? body.itens : [];
  const itens = itensBrutos.filter(validarItem);

  if (itens.length === 0) {
    return NextResponse.json({ criadas: 0, ignoradas: itensBrutos.length });
  }

  const data: Prisma.ContaPagarCreateManyInput[] = itens.map((item) => ({
    tipo: item.tipo,
    descricao: item.descricao,
    valor: item.valor,
    dataVencimento: new Date(item.dataVencimento),
    favorecido: item.favorecido || null,
    observacoes: item.observacoes || null,
    status: "PENDENTE",
    chaveAcesso: item.chave,
  }));

  const resultado = await prisma.contaPagar.createMany({ data, skipDuplicates: true });
  const criadas = resultado.count;
  const ignoradas = itensBrutos.length - criadas;

  await logFromRequest(req, "OUTRO", {
    user: { id: auth.user.id, email: auth.user.email, name: auth.user.nome, role: auth.user.role },
    recursoTipo: "conta-pagar",
    detalhes: { acao: "importacao-sincronizacao", criadas, ignoradas },
  });

  return NextResponse.json({ criadas, ignoradas });
}
