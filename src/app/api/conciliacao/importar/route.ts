import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { parseOfx, ehArquivoOfx } from "@/lib/extrato/ofx";
import { parseMinhasFinancas, ehCsvMinhasFinancas } from "@/lib/extrato/minhas-financas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface LinhaImportada {
  contaNome: string | null; // CSV traz a conta por linha
  idExterno: string;
  data: Date;
  valor: number;
  descricao: string;
  documento: string | null;
  observacoes?: string | null;
}

/**
 * Importa extrato em OFX (um arquivo = uma conta) ou no CSV do Minhas Finanças
 * (um arquivo = VÁRIAS contas, uma por linha).
 *
 * A transação é guardada crua, sem virar lançamento. Converter na hora
 * perderia a rastreabilidade e impediria deduplicar reimportação.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const contaIdManual = (formData.get("contaId") as string) || null;
  if (!file) return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });

  const conteudo = await file.text();
  const linhas: LinhaImportada[] = [];
  let origem: "OFX" | "MINHAS_FINANCAS";
  let contaUnica: { id: string; nome: string } | null = null;
  let periodo: { inicio: Date | null; fim: Date | null } = { inicio: null, fim: null };

  if (ehArquivoOfx(conteudo)) {
    origem = "OFX";
    let extrato;
    try { extrato = parseOfx(conteudo); }
    catch (e: any) { return NextResponse.json({ error: e.message || "Erro ao ler o OFX" }, { status: 400 }); }

    if (extrato.transacoes.length === 0) {
      return NextResponse.json({ error: "Nenhuma transação encontrada no arquivo" }, { status: 400 });
    }
    periodo = { inicio: extrato.dataInicio, fim: extrato.dataFim };

    // A conta vem do ACCTID quando já cadastrada; senão o usuário escolhe.
    let conta = null;
    if (extrato.identificadorConta) {
      conta = await prisma.contaBancaria.findUnique({ where: { identificadorOfx: extrato.identificadorConta } });
    }
    if (!conta && contaIdManual) {
      conta = await prisma.contaBancaria.findUnique({ where: { id: contaIdManual } });
      // Memoriza o ACCTID para os próximos arquivos entrarem sozinhos.
      if (conta && extrato.identificadorConta && !conta.identificadorOfx) {
        conta = await prisma.contaBancaria.update({
          where: { id: conta.id },
          data: { identificadorOfx: extrato.identificadorConta },
        });
      }
    }
    if (!conta) {
      return NextResponse.json({
        error: "Conta não identificada", precisaEscolherConta: true,
        identificadorOfx: extrato.identificadorConta,
        totalTransacoes: extrato.transacoes.length,
      }, { status: 409 });
    }
    contaUnica = { id: conta.id, nome: conta.nome };

    for (const t of extrato.transacoes) {
      linhas.push({ contaNome: null, idExterno: t.idExterno, data: t.data, valor: t.valor, descricao: t.descricao, documento: t.documento });
    }
  } else if (ehCsvMinhasFinancas(conteudo)) {
    origem = "MINHAS_FINANCAS";
    let extrato;
    try { extrato = parseMinhasFinancas(conteudo, file.name); }
    catch (e: any) { return NextResponse.json({ error: e.message || "Erro ao ler o CSV" }, { status: 400 }); }

    if (extrato.transacoes.length === 0) {
      return NextResponse.json({ error: "Nenhuma transação encontrada no CSV" }, { status: 400 });
    }
    const datas = extrato.transacoes.map((t) => t.data.getTime());
    periodo = { inicio: new Date(Math.min(...datas)), fim: new Date(Math.max(...datas)) };

    for (const t of extrato.transacoes) {
      linhas.push({
        contaNome: t.conta, idExterno: t.idExterno, data: t.data, valor: t.valor,
        descricao: t.descricao, documento: t.documento, observacoes: t.observacoes,
      });
    }
  } else {
    return NextResponse.json(
      { error: "Arquivo não reconhecido. Envie um OFX do banco ou o CSV exportado do Minhas Finanças." },
      { status: 400 }
    );
  }

  // O CSV mistura contas no mesmo arquivo; resolve cada nome uma vez só.
  // Conta nova é criada automaticamente — o nome vem limpo do app
  // ("Banco Inter PJ", "Sicredi Empresas") e obrigar cadastro manual de cinco
  // contas antes do primeiro import seria atrito sem ganho.
  const porNome = new Map<string, string>();
  const contasCriadas: string[] = [];
  if (origem === "MINHAS_FINANCAS") {
    const nomes = Array.from(new Set(linhas.map((l) => l.contaNome!).filter(Boolean)));
    for (const nome of nomes) {
      let conta = await prisma.contaBancaria.findFirst({
        where: { nome: { equals: nome, mode: "insensitive" } },
      });
      if (!conta) {
        conta = await prisma.contaBancaria.create({ data: { nome } });
        contasCriadas.push(nome);
      }
      porNome.set(nome, conta.id);
    }
  }

  let novas = 0;
  let duplicadas = 0;

  for (const l of linhas) {
    const contaId = contaUnica ? contaUnica.id : porNome.get(l.contaNome!);
    if (!contaId) continue;

    const existente = await prisma.transacaoBancaria.findUnique({
      where: { contaId_idExterno: { contaId, idExterno: l.idExterno } },
    });
    if (existente) { duplicadas++; continue; }

    await prisma.transacaoBancaria.create({
      data: {
        contaId, data: l.data, valor: l.valor,
        // A observação escrita à mão no app ("Parc de acerto rescisao") é
        // contexto que o extrato do banco não tem — vale carregar junto.
        descricao: l.observacoes ? `${l.descricao} — ${l.observacoes}` : l.descricao,
        documento: l.documento, idExterno: l.idExterno, origem,
      },
    });
    novas++;
  }

  return NextResponse.json({
    origem,
    conta: contaUnica,
    contasCriadas,
    periodo,
    lidas: linhas.length,
    novas,
    duplicadas,
  });
}
