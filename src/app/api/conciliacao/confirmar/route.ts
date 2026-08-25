import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { logFromRequest } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Acao {
  transacaoId: string;
  /** casar = amarra a um lançamento existente e marca pago
   *  criar = gera lançamento novo a partir da linha do extrato
   *  ignorar = some da fila e não volta */
  acao: "casar" | "criar" | "ignorar";
  lancamentoId?: string;
  categoriaId?: string;
  foraDoDre?: boolean;
}

/**
 * Aplica as decisões da tela de conciliação.
 *
 * Tudo numa transação só: conciliar mexe em caixa e DRE, e um lote aplicado
 * pela metade deixaria o financeiro num estado que ninguém consegue auditar.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const sessionUser = session.user as any;

  const body = await req.json().catch(() => ({}));
  const acoes: Acao[] = Array.isArray(body.acoes) ? body.acoes : [];
  if (acoes.length === 0) {
    return NextResponse.json({ error: "Nenhuma ação enviada" }, { status: 400 });
  }

  const resultado = { conciliadas: 0, criadas: 0, ignoradas: 0, erros: [] as string[] };

  try {
    await prisma.$transaction(async (tx) => {
      for (const a of acoes) {
        const t = await tx.transacaoBancaria.findUnique({ where: { id: a.transacaoId } });
        if (!t) { resultado.erros.push(`Transação ${a.transacaoId} não encontrada`); continue; }
        if (t.status !== "PENDENTE") { resultado.erros.push(`${t.descricao}: já processada`); continue; }

        if (a.acao === "ignorar") {
          await tx.transacaoBancaria.update({ where: { id: t.id }, data: { status: "IGNORADA" } });
          resultado.ignoradas++;
          continue;
        }

        if (a.acao === "casar") {
          if (!a.lancamentoId) { resultado.erros.push(`${t.descricao}: sem lançamento`); continue; }

          const lanc = await tx.lancamentoFinanceiro.findUnique({ where: { id: a.lancamentoId } });
          if (!lanc) { resultado.erros.push(`${t.descricao}: lançamento não existe`); continue; }
          // Guarda contra dois extratos apontando para o mesmo lançamento.
          if (lanc.status === "PAGO") {
            resultado.erros.push(`${t.descricao}: lançamento já estava pago`);
            continue;
          }

          await tx.lancamentoFinanceiro.update({
            where: { id: lanc.id },
            data: {
              status: "PAGO",
              dataPagamento: t.data,
              contaBancariaId: t.contaId,
            },
          });
          await tx.transacaoBancaria.update({
            where: { id: t.id },
            data: { status: "CONCILIADA", lancamentoId: lanc.id },
          });
          resultado.conciliadas++;
          continue;
        }

        // criar: a linha do extrato vira lançamento novo, já pago.
        // O CPF/CNPJ que veio na descrição identifica o favorecido: 9 de cada
        // 12 documentos do extrato real são de motorista cadastrado. Sem isto
        // o lançamento nasceria anônimo e alguém teria que digitar o nome.
        const favorecido = await resolverFavorecido(tx, t.documento);
        const novo = await tx.lancamentoFinanceiro.create({
          data: {
            descricao: t.descricao,
            favorecido,
            tipo: t.valor < 0 ? "DESPESA" : "RECEITA",
            valor: Math.abs(t.valor),
            dataVencimento: t.data,
            dataPagamento: t.data,
            status: "PAGO",
            origem: "EXTRATO_BANCARIO",
            contaBancariaId: t.contaId,
            categoriaId: a.categoriaId || null,
            foraDoDre: a.foraDoDre === true,
          },
        });
        await tx.transacaoBancaria.update({
          where: { id: t.id },
          data: { status: "CONCILIADA", lancamentoId: novo.id },
        });
        resultado.criadas++;
      }
    });
  } catch (e: any) {
    console.error("[conciliacao] erro ao aplicar:", e);
    return NextResponse.json({ error: e?.message || "Erro ao aplicar a conciliação" }, { status: 500 });
  }

  await logFromRequest(req, "LANCAMENTO_EDITADO", {
    user: { id: sessionUser.id, email: sessionUser.email, name: sessionUser.name, role: sessionUser.role },
    recursoTipo: "conciliacao",
    recursoDesc: `${resultado.conciliadas} conciliada(s), ${resultado.criadas} criada(s), ${resultado.ignoradas} ignorada(s)`,
    detalhes: resultado,
  });

  return NextResponse.json(resultado);
}

/**
 * Traduz o CPF/CNPJ achado na descrição do extrato para um nome conhecido.
 * O banco escreve "Maxwel"; o cadastro tem "MAXWEEL" — o documento e o unico
 * identificador estavel entre os dois lados.
 */
async function resolverFavorecido(tx: any, documento: string | null): Promise<string | null> {
  if (!documento) return null;
  const doc = documento.replace(/\D/g, "");
  if (doc.length !== 11 && doc.length !== 14) return null;

  if (doc.length === 11) {
    const motoristas = await tx.motorista.findMany({ select: { nome: true, cpf: true } });
    const m = motoristas.find((x: any) => (x.cpf || "").replace(/\D/g, "") === doc);
    if (m) return m.nome;
  } else {
    const cliente = await tx.cliente.findFirst({
      where: { cnpj: { contains: doc } },
      select: { razaoSocial: true },
    });
    if (cliente) return cliente.razaoSocial;
  }
  return null;
}
