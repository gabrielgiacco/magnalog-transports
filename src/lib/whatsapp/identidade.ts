// Quem é o dono deste número de telefone.
//
// É a peça de segurança do atendimento por WhatsApp: o telefone é a ÚNICA
// credencial que um cliente apresenta. Errar aqui significa mostrar carga de
// um embarcador para outro.
//
// Regra: embarcador cadastrado vê nota do próprio CNPJ emitente; motorista
// cadastrado vê a viagem dele; número desconhecido não vê dado nenhum.

import { prisma } from "@/lib/prisma";
import { variantesTelefoneBR } from "@/lib/telefone";

export interface EmbarcadorIdentificado {
  cnpj: string;
  nome: string;
}

export interface Identidade {
  /** Só preenchido para motorista ATIVO. Inativo é como desconhecido. */
  motorista: { id: string; nome: string } | null;
  /** Um número pode responder por mais de um embarcador. */
  embarcadores: EmbarcadorIdentificado[];
  conhecido: boolean;
}

const DESCONHECIDO: Identidade = { motorista: null, embarcadores: [], conhecido: false };

/**
 * Resolve o telefone contra os dois cadastros.
 *
 * NÃO desempata quando o número casa nos dois: carrega motorista E
 * embarcadores, e quem decide o que pode ser mostrado é a autorização, com um
 * OU. Escolher um lado aqui faria um motorista que também é contato do
 * embarcador perder acesso à própria viagem.
 *
 * As duas consultas usam as colunas normalizadas e indexadas, em paralelo.
 */
export async function resolverIdentidade(telefone: string): Promise<Identidade> {
  const variantes = variantesTelefoneBR(telefone);
  if (variantes.length === 0) return DESCONHECIDO;

  const [motorista, tabelas] = await Promise.all([
    prisma.motorista.findFirst({
      where: { telefoneNorm: { in: variantes }, ativo: true },
      select: { id: true, nome: true },
    }),
    prisma.tabelaTicket.findMany({
      where: { whatsappNorm: { in: variantes } },
      select: { cnpjEmbarcador: true, nomeEmbarcador: true },
    }),
  ]);

  const embarcadores = tabelas.map((t) => ({
    cnpj: t.cnpjEmbarcador,
    nome: t.nomeEmbarcador,
  }));

  return {
    motorista,
    embarcadores,
    conhecido: Boolean(motorista) || embarcadores.length > 0,
  };
}
