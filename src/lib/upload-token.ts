import { prisma } from "@/lib/prisma";

/**
 * Resolve o token do link do motorista para a entrega dele.
 *
 * Mora aqui, e não na rota, porque duas rotas usam o mesmo gate: a de upload
 * (/api/public/upload/[token]) e a de status (.../status). Arquivo de rota do
 * Next só pode exportar handlers, então o helper compartilhado precisa de um
 * módulo próprio.
 *
 * Um token aponta para UMA entrega e expira em 48h. Revogar (DELETE no modal)
 * anula o token, então o próximo uso cai no `null` aqui e a página mostra
 * "Link inválido". É o único ponto onde a validade é decidida — nenhum handler
 * pode pular esta função.
 */
export async function validarToken(token: string) {
  if (!token) return null;
  const entrega = await prisma.entrega.findUnique({
    where: { uploadToken: token },
    select: {
      id: true, codigo: true, razaoSocial: true, cidade: true, uf: true,
      dataAgendada: true, uploadTokenExpira: true, statusCanhoto: true,
      status: true, dataEntrega: true,
      notas: { select: { numero: true, emitenteRazao: true } },
      motorista: { select: { id: true, nome: true } },
    },
  });
  if (!entrega) return null;
  if (!entrega.uploadTokenExpira || entrega.uploadTokenExpira < new Date()) return null;
  return entrega;
}

export type EntregaDoToken = NonNullable<Awaited<ReturnType<typeof validarToken>>>;
