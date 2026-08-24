import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { parseOfx, ehArquivoOfx } from "@/lib/extrato/ofx";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Importa extrato. Hoje só OFX; o parser do export do Minhas Finanças entra
 * aqui do lado assim que houver um arquivo real para conferir o layout.
 *
 * A transação bancária é guardada crua, sem virar lançamento. Converter na
 * hora perderia a rastreabilidade de onde o número veio e impediria
 * deduplicar reimportação.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const contaIdManual = (formData.get("contaId") as string) || null;

  if (!file) return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });

  const conteudo = await file.text();
  if (!ehArquivoOfx(conteudo)) {
    return NextResponse.json(
      { error: "Arquivo não reconhecido. Por enquanto só OFX é aceito." },
      { status: 400 }
    );
  }

  let extrato;
  try {
    extrato = parseOfx(conteudo);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Erro ao ler o OFX" }, { status: 400 });
  }

  if (extrato.transacoes.length === 0) {
    return NextResponse.json({ error: "Nenhuma transação encontrada no arquivo" }, { status: 400 });
  }

  // A conta vem do ACCTID do próprio arquivo quando já foi cadastrada; senão
  // o usuário escolhe na tela. Isso evita ter de selecionar a cada import.
  let conta = null;
  if (extrato.identificadorConta) {
    conta = await prisma.contaBancaria.findUnique({
      where: { identificadorOfx: extrato.identificadorConta },
    });
  }
  if (!conta && contaIdManual) {
    conta = await prisma.contaBancaria.findUnique({ where: { id: contaIdManual } });
    // Grava o identificador para os próximos arquivos entrarem sozinhos.
    if (conta && extrato.identificadorConta && !conta.identificadorOfx) {
      conta = await prisma.contaBancaria.update({
        where: { id: conta.id },
        data: { identificadorOfx: extrato.identificadorConta },
      });
    }
  }

  if (!conta) {
    return NextResponse.json(
      {
        error: "Conta não identificada",
        precisaEscolherConta: true,
        identificadorOfx: extrato.identificadorConta,
        totalTransacoes: extrato.transacoes.length,
      },
      { status: 409 }
    );
  }

  let novas = 0;
  let duplicadas = 0;

  for (const t of extrato.transacoes) {
    const existente = await prisma.transacaoBancaria.findUnique({
      where: { contaId_idExterno: { contaId: conta.id, idExterno: t.idExterno } },
    });
    if (existente) { duplicadas++; continue; }

    await prisma.transacaoBancaria.create({
      data: {
        contaId: conta.id,
        data: t.data,
        valor: t.valor,
        descricao: t.descricao,
        documento: t.documento,
        idExterno: t.idExterno,
        origem: "OFX",
      },
    });
    novas++;
  }

  return NextResponse.json({
    conta: { id: conta.id, nome: conta.nome },
    periodo: { inicio: extrato.dataInicio, fim: extrato.dataFim },
    lidas: extrato.transacoes.length,
    novas,
    duplicadas,
  });
}
