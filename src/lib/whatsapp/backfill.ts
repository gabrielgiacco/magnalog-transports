// Preenche as colunas normalizadas de telefone nos cadastros que já existiam
// antes delas.
//
// Fica no lib e não na rota para poder ser exercitado sem sessão — é o padrão
// do src/lib/anexos.ts, que deixa a rota com meia dúzia de linhas.
//
// Idempotente: recalcula sempre a partir do campo digitado, então rodar de
// novo depois de corrigir um cadastro é o caminho normal, não um risco.

import { prisma } from "@/lib/prisma";
import { normalizarTelefoneBR } from "@/lib/telefone";

export interface ResumoBackfill {
  total: number;
  atualizados: number;
  /** Cadastro com telefone que não dá para usar. É o número a olhar quando o
   *  atendimento "não reconhece" alguém. */
  semTelefoneValido: number;
}

export interface ResultadoBackfill {
  motoristas: ResumoBackfill;
  embarcadores: ResumoBackfill;
}

export async function backfillTelefones(): Promise<ResultadoBackfill> {
  const motoristas = await prisma.motorista.findMany({
    select: { id: true, telefone: true, telefoneNorm: true },
  });

  const resumoMotoristas: ResumoBackfill = {
    total: motoristas.length,
    atualizados: 0,
    semTelefoneValido: 0,
  };

  for (const m of motoristas) {
    const norm = normalizarTelefoneBR(m.telefone);
    if (!norm) resumoMotoristas.semTelefoneValido++;
    if (norm === m.telefoneNorm) continue;
    await prisma.motorista.update({ where: { id: m.id }, data: { telefoneNorm: norm } });
    resumoMotoristas.atualizados++;
  }

  const tabelas = await prisma.tabelaTicket.findMany({
    select: { id: true, whatsapp: true, whatsappNorm: true },
  });

  const resumoEmbarcadores: ResumoBackfill = {
    total: tabelas.length,
    atualizados: 0,
    semTelefoneValido: 0,
  };

  for (const t of tabelas) {
    const norm = normalizarTelefoneBR(t.whatsapp);
    if (!norm) resumoEmbarcadores.semTelefoneValido++;
    if (norm === t.whatsappNorm) continue;
    await prisma.tabelaTicket.update({ where: { id: t.id }, data: { whatsappNorm: norm } });
    resumoEmbarcadores.atualizados++;
  }

  return { motoristas: resumoMotoristas, embarcadores: resumoEmbarcadores };
}
