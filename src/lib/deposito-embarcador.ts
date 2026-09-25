import { PrismaClient } from "@prisma/client";

// Resolve quem é o embarcador (o fornecedor que contratou o frete — ver
// CLAUDE.md, "Vocabulário do domínio") a partir de um par de CNPJs candidatos.
// A armadilha: numa devolução, quem EMITE a NF de retorno é o destinatário
// original — o embarcador é o outro lado. Numa recusa simples, o emitente já
// É o embarcador. Por isso cada candidato entra com dois lados (A e B) e esta
// função decide, sem assumir qual convenção o chamador usou.

export interface EmbarcadorResolvido {
  cnpj: string;
  razao: string;
}

interface ParCandidato {
  chave: string;
  cnpjA: string | null;
  razaoA: string | null;
  cnpjB: string | null;
  razaoB: string | null;
}

function soDigitos(v: string | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

/**
 * Resolve o embarcador para um lote de candidatos, EM LOTE. Nunca faz await
 * por linha: 200 candidatos virariam 400 idas ao banco.
 *
 * Ordem de decisão por candidato:
 * 1. Cadastro (TabelaTicket.cnpjEmbarcador) — quem estiver cadastrado ganha;
 *    se os dois lados estiverem, prefere A.
 * 2. Fallback: quem já emitiu uma NF que passou por aqui é embarcador
 *    (NotaFiscal.emitenteCnpj), mesma preferência por A.
 * 3. Fallback final: lado A como veio — é o lado que o chamador normalmente
 *    preenche como palpite mais provável.
 */
export async function resolverEmbarcadores(
  prismaClient: PrismaClient,
  pares: ParCandidato[],
): Promise<Map<string, EmbarcadorResolvido>> {
  const resultado = new Map<string, EmbarcadorResolvido>();

  // Formas cruas (como vieram, com ou sem pontuação) dos candidatos — a base
  // para gerar as variantes de busca abaixo.
  const todosOsCnpjsCrus = Array.from(
    new Set(
      pares
        .flatMap((p) => [p.cnpjA, p.cnpjB])
        .filter((c): c is string => !!c && c.trim().length > 0),
    ),
  );
  if (todosOsCnpjsCrus.length === 0) return resultado;

  // A maioria das linhas grava CNPJ só com dígitos, mas nem sempre — inclui a
  // forma crua E a normalizada no `in` para não perder uma linha pontuada.
  const variantes = Array.from(
    new Set(todosOsCnpjsCrus.flatMap((c) => [c, soDigitos(c)]).filter(Boolean)),
  );

  const [tickets, emissores] = await Promise.all([
    prismaClient.tabelaTicket.findMany({
      where: { cnpjEmbarcador: { in: variantes } },
      select: { cnpjEmbarcador: true, nomeEmbarcador: true },
    }),
    prismaClient.notaFiscal.findMany({
      where: { emitenteCnpj: { in: variantes } },
      distinct: ["emitenteCnpj"],
      select: { emitenteCnpj: true, emitenteRazao: true },
    }),
  ]);

  const ticketPorCnpj = new Map(tickets.map((t) => [soDigitos(t.cnpjEmbarcador), t]));
  const emissorPorCnpj = new Map(emissores.map((n) => [soDigitos(n.emitenteCnpj), n]));

  for (const par of pares) {
    const cnpjA = soDigitos(par.cnpjA);
    const cnpjB = soDigitos(par.cnpjB);

    const ticketA = cnpjA ? ticketPorCnpj.get(cnpjA) : undefined;
    if (ticketA) {
      resultado.set(par.chave, { cnpj: cnpjA, razao: ticketA.nomeEmbarcador });
      continue;
    }
    const ticketB = cnpjB ? ticketPorCnpj.get(cnpjB) : undefined;
    if (ticketB) {
      resultado.set(par.chave, { cnpj: cnpjB, razao: ticketB.nomeEmbarcador });
      continue;
    }

    const emissorA = cnpjA ? emissorPorCnpj.get(cnpjA) : undefined;
    if (emissorA) {
      resultado.set(par.chave, { cnpj: cnpjA, razao: emissorA.emitenteRazao });
      continue;
    }
    const emissorB = cnpjB ? emissorPorCnpj.get(cnpjB) : undefined;
    if (emissorB) {
      resultado.set(par.chave, { cnpj: cnpjB, razao: emissorB.emitenteRazao });
      continue;
    }

    resultado.set(par.chave, { cnpj: cnpjA, razao: par.razaoA ?? "" });
  }

  return resultado;
}
