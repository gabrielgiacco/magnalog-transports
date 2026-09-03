// Resolve os embarcadores de uma entrega e o WhatsApp de cada um.
//
// O EMBARCADOR é o emitente da NF (quem contratou o frete e para quem a
// Magnalog dá o retorno) — não confundir com entrega.cnpj, que é o
// destinatário da carga. Mesma regra usada em src/lib/ticket-data.ts.
//
// O número fica na TabelaTicket, que já é o cadastro por embarcador onde
// moram os e-mails de contato do ticket.

import { prisma } from "@/lib/prisma";
import { normalizarTelefoneBR } from "@/lib/telefone";

export interface EmbarcadorContato {
  cnpj: string;
  nome: string;
  whatsapp: string | null;        // como foi cadastrado, para exibir
  telefoneValido: string | null;  // E.164, ou null se não dá para enviar
}

export interface ContatosEntrega {
  entregaId: string;
  codigo: string;
  destinatario: string;  // quem recebeu a carga, citado no texto do aviso
  dataEntrega: Date | null;
  notaNumero: string | null;
  embarcadores: EmbarcadorContato[];
}

export async function resolverContatosEntrega(entregaId: string): Promise<ContatosEntrega | null> {
  const entrega = await prisma.entrega.findUnique({
    where: { id: entregaId },
    select: {
      id: true,
      codigo: true,
      razaoSocial: true,
      cidade: true,
      uf: true,
      dataEntrega: true,
      cliente: { select: { razaoSocial: true } },
      notas: {
        select: { numero: true, emitenteCnpj: true, emitenteRazao: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!entrega) return null;

  // Um embarcador por emitente distinto, preservando a ordem das notas.
  const mapa = new Map<string, string>();
  for (const n of entrega.notas) {
    const cnpj = (n.emitenteCnpj || "").replace(/\D/g, "");
    if (cnpj && !mapa.has(cnpj)) mapa.set(cnpj, n.emitenteRazao || cnpj);
  }

  const cnpjs = Array.from(mapa.keys());
  const tabelas = cnpjs.length
    ? await prisma.tabelaTicket.findMany({
        where: { cnpjEmbarcador: { in: cnpjs } },
        select: { cnpjEmbarcador: true, nomeEmbarcador: true, whatsapp: true },
      })
    : [];
  const porCnpj = new Map(tabelas.map((t) => [t.cnpjEmbarcador, t]));

  const embarcadores: EmbarcadorContato[] = cnpjs.map((cnpj) => {
    const tabela = porCnpj.get(cnpj);
    return {
      cnpj,
      // O nome cadastrado ganha do da NF: é como a operação chama o embarcador.
      nome: tabela?.nomeEmbarcador || mapa.get(cnpj) || cnpj,
      whatsapp: tabela?.whatsapp || null,
      telefoneValido: normalizarTelefoneBR(tabela?.whatsapp),
    };
  });

  return {
    entregaId: entrega.id,
    codigo: entrega.codigo,
    destinatario: entrega.cliente?.razaoSocial || entrega.razaoSocial,
    dataEntrega: entrega.dataEntrega,
    notaNumero: entrega.notas[0]?.numero || null,
    embarcadores,
  };
}
