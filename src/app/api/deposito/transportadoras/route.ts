import { NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Lista de sugestao de transportadora para a tela de Deposito. Uniao de tres
// fontes: acordo de frete cadastrado, o que ja foi digitado em itens do
// deposito, e o texto livre de Avaria.transportadoraChegada.
//
// O historico NAO e reescrito (decisao do dono), mas a SUGESTAO agrupa: ha
// 12 grafias para ~6 transportadoras reais, e oferecer cinco variantes de
// "PORTO" faria o conferente escolher uma ao acaso, que e exatamente o que a
// lista existe para evitar. Agrupa pela primeira palavra e mostra uma
// representante por grupo — de preferencia a do acordo cadastrado, senao a
// grafia mais completa. O filtro da tela e `contains`, entao qualquer grafia
// antiga continua sendo encontrada.
const IGNORAR_NO_AGRUPAMENTO = new Set(["cia", "transportes", "transporte", "log", "logistica"]);

/** Primeira palavra significativa, sem pontuacao — a chave do grupo. */
function chaveGrupo(nome: string): string {
  const palavras = nome
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const significativa = palavras.find((p) => p.length > 2 && !IGNORAR_NO_AGRUPAMENTO.has(p));
  return significativa || palavras[0] || nome.toLowerCase();
}
export async function GET() {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const [acordos, itensDeposito, avarias] = await Promise.all([
    prisma.acordoTransportadora.findMany({ select: { transportadoraNome: true } }),
    prisma.depositoItem.findMany({
      where: { transportadora: { not: null } },
      select: { transportadora: true },
      distinct: ["transportadora"],
    }),
    prisma.avaria.findMany({
      where: { transportadoraChegada: { not: null } },
      select: { transportadoraChegada: true },
      distinct: ["transportadoraChegada"],
    }),
  ]);

  const nomesAcordo = new Set(acordos.map((a) => a.transportadoraNome.trim().toLowerCase()));
  const brutos = [
    ...acordos.map((a) => a.transportadoraNome),
    ...itensDeposito.map((i) => i.transportadora),
    ...avarias.map((a) => a.transportadoraChegada),
  ];

  // Uma representante por grupo: a cadastrada no acordo ganha; sem acordo,
  // vence a grafia mais longa, que costuma ser a razao social completa.
  const porGrupo = new Map<string, string>();
  for (const nome of brutos) {
    const valor = (nome || "").trim().replace(/\s+/g, " ");
    if (!valor) continue;
    const grupo = chaveGrupo(valor);
    const atual = porGrupo.get(grupo);
    if (!atual) {
      porGrupo.set(grupo, valor);
      continue;
    }
    if (nomesAcordo.has(atual.toLowerCase())) continue;
    if (nomesAcordo.has(valor.toLowerCase()) || valor.length > atual.length) {
      porGrupo.set(grupo, valor);
    }
  }

  const transportadoras = Array.from(porGrupo.values()).sort((a, b) => a.localeCompare(b, "pt-BR"));

  return NextResponse.json({ transportadoras });
}
