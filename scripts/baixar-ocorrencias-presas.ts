/**
 * Baixa retroativa das ocorrencias que ficaram presas em aberto antes da
 * correcao: a reentrega nao fechava a ocorrencia da entrega original, e
 * Kanban, status Entregue e o link do motorista nao davam baixa.
 *
 * Sem flag: PREVIA, so le e mostra o que faria.
 *   npx tsx scripts/baixar-ocorrencias-presas.ts
 * Com --aplicar: grava numa transacao.
 *   npx tsx scripts/baixar-ocorrencias-presas.ts --aplicar
 *
 * ATENCAO: o .env local aponta para o banco de PRODUCAO.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APLICAR = process.argv.includes("--aplicar");
const MARCA_FALHA = "Tentativa Falha das NFs:";
const SUFIXO_FALHA = " (FALHA)";

type Entrega = {
  id: string;
  codigo: string;
  cnpj: string;
  status: string;
  razaoSocial: string;
  observacoes: string | null;
  notas: { numero: string }[];
};

type Linha = {
  ocorrenciaId: string;
  nfs: string;
  codigo: string;
  cliente: string;
  status: string;
  tipo: string;
  criada: string;
  resolucao: string;
};

/** NFs da entrega; na casca de reentrega elas foram movidas e so restam no texto das observacoes. */
function nfsDe(e: Entrega): string {
  if (e.notas.length > 0) return e.notas.map((n) => n.numero).join(", ");
  const m = e.observacoes?.match(/Tentativa Falha das NFs:\s*([^\n\r]+)/);
  return m ? m[1].trim() : "-";
}

function ehCascaDeReentrega(e: Entrega): boolean {
  return e.status === "OCORRENCIA" && (e.codigo.endsWith(SUFIXO_FALHA) || (e.observacoes ?? "").includes(MARCA_FALHA));
}

/** Codigo da entrega criada pela reentrega: mesmo CNPJ, codigo "<base>-R<n>", a primeira criada depois da ocorrencia. */
async function codigoDaReentrega(e: Entrega, depoisDe: Date): Promise<string | null> {
  const base = e.codigo.endsWith(SUFIXO_FALHA) ? e.codigo.slice(0, -SUFIXO_FALHA.length) : e.codigo;
  const clone = await prisma.entrega.findFirst({
    where: { id: { not: e.id }, cnpj: e.cnpj, codigo: { startsWith: `${base}-R` }, createdAt: { gte: depoisDe } },
    orderBy: { createdAt: "asc" },
    select: { codigo: true },
  });
  if (!clone) return null;
  return clone.codigo.endsWith(SUFIXO_FALHA) ? clone.codigo.slice(0, -SUFIXO_FALHA.length) : clone.codigo;
}

function mostrar(titulo: string, linhas: Linha[]) {
  console.log(`\n=== ${titulo}: ${linhas.length} ===`);
  if (linhas.length === 0) return;
  console.table(
    linhas.map((l) => ({ NF: l.nfs, Codigo: l.codigo, Cliente: l.cliente.slice(0, 30), Status: l.status, Tipo: l.tipo, Criada: l.criada, Resolucao: l.resolucao })),
  );
}

async function main() {
  const abertas = await prisma.ocorrencia.findMany({
    where: { resolvida: false },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      tipo: true,
      createdAt: true,
      entrega: {
        select: { id: true, codigo: true, cnpj: true, status: true, razaoSocial: true, observacoes: true, notas: { select: { numero: true } } },
      },
    },
  });

  const reentrega: Linha[] = [];
  const concluida: Linha[] = [];
  const continuam: Linha[] = [];

  for (const oc of abertas) {
    const e = oc.entrega;
    const linha = (resolucao: string): Linha => ({
      ocorrenciaId: oc.id,
      nfs: nfsDe(e),
      codigo: e.codigo,
      cliente: e.razaoSocial,
      status: e.status,
      tipo: oc.tipo,
      criada: oc.createdAt.toISOString().slice(0, 10),
      resolucao,
    });

    if (ehCascaDeReentrega(e)) {
      const nova = await codigoDaReentrega(e, oc.createdAt);
      reentrega.push(linha(nova ? `Reentrega gerada — nova entrega ${nova}` : "Reentrega gerada (baixa retroativa)"));
    } else if (e.status === "ENTREGUE" || e.status === "FINALIZADO") {
      concluida.push(linha("Baixa retroativa — entrega já concluída"));
    } else {
      continuam.push(linha("(não será alterada)"));
    }
  }

  mostrar("Reentrega gerada (serão baixadas)", reentrega);
  mostrar("Entrega já concluída (serão baixadas)", concluida);
  mostrar("Continuam em aberto (não mexo — resolver à mão se for o caso)", continuam);

  if (!APLICAR) {
    console.log(`\nPRÉVIA: nada foi gravado. Para aplicar: npx tsx scripts/baixar-ocorrencias-presas.ts --aplicar`);
    return;
  }

  // updateMany com resolvida:false: se alguém resolveu à mão entre a prévia e agora, não sobrescreve.
  const resultados = await prisma.$transaction(
    [...reentrega, ...concluida].map((l) =>
      prisma.ocorrencia.updateMany({
        where: { id: l.ocorrenciaId, resolvida: false },
        data: { resolvida: true, resolucao: l.resolucao },
      }),
    ),
  );
  const gravadas = resultados.reduce((s, r) => s + r.count, 0);
  console.log(`\nAPLICADO: ${gravadas} ocorrência(s) baixada(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
