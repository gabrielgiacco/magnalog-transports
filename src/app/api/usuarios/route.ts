import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { logAudit, extractRequestMeta } from "@/lib/audit";
import bcrypt from "bcryptjs";

// Custo do bcrypt. 12 e o piso recomendado hoje; hashes antigos (custo 10)
// continuam validando normalmente e sobem para 12 quando a senha for trocada.
const BCRYPT_ROUNDS = 12;

export async function GET(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const session = auth.session;

  const user = session.user as any;
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const usuarios = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, email: true, role: true,
      ativo: true, aprovado: true, createdAt: true, image: true,
      fornecedoresAutorizados: true,
    },
  });

  return NextResponse.json(usuarios);
}

export async function POST(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const session = auth.session;

  const user = session.user as any;
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) return NextResponse.json({ error: "E-mail obrigatório" }, { status: 400 });

  // Inativo ainda segura o e-mail (unique): avisar em vez de estourar com 500.
  // O login compara sem diferenciar maiusculas; a checagem precisa fazer o mesmo.
  const existente = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { ativo: true },
  });
  if (existente) {
    return NextResponse.json(
      { error: existente.ativo ? "E-mail já cadastrado" : "E-mail já cadastrado em um usuário inativo — exclua-o ou reative-o" },
      { status: 409 },
    );
  }

  const hash = await bcrypt.hash(body.password || "Magnalog@2025", BCRYPT_ROUNDS);

  const novo = await prisma.user.create({
    data: {
      name: body.name,
      email,
      password: hash,
      role: body.role || "OPERACIONAL",
      aprovado: true,
      ativo: true,
    },
  });

  return NextResponse.json({ id: novo.id, name: novo.name, email: novo.email, role: novo.role }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const session = auth.session;

  const user = session.user as any;
  const body = await req.json();
  const { id, fornecedoresAutorizados, senhaAtual, ...data } = body;

  // Usuário não-admin só pode alterar a própria senha
  if (user.role !== "ADMIN") {
    if (id !== user.id || Object.keys(data).some((k) => k !== "password")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
  }

  // Se está alterando senha, fazer hash
  if (data.password) {
    // Se não é admin OU está alterando a própria senha, validar senha atual
    if (id === user.id && senhaAtual) {
      const dbUser = await prisma.user.findUnique({ where: { id }, select: { password: true } });
      if (!dbUser?.password || !(await bcrypt.compare(senhaAtual, dbUser.password))) {
        return NextResponse.json({ error: "Senha atual incorreta" }, { status: 400 });
      }
    } else if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Senha atual é obrigatória" }, { status: 400 });
    }
    data.password = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  }

  const updated = await prisma.user.update({ where: { id }, data });

  // Atualizar fornecedores autorizados (portal do cliente)
  if (fornecedoresAutorizados !== undefined) {
    await prisma.fornecedorAutorizado.deleteMany({ where: { userId: id } });
    if (fornecedoresAutorizados.length) {
      await prisma.fornecedorAutorizado.createMany({
        data: fornecedoresAutorizados.map((cnpj: string) => ({ userId: id, cnpjEmitente: cnpj })),
      });
    }
  }

  return NextResponse.json(updated);
}

// Relacoes obrigatorias (Restrict no banco): o delete seria recusado. Quem
// tem qualquer uma delas so pode ser desativado.
const TRAVAS = {
  avariasRegistradas: "avaria(s) registrada(s)",
  orcamentos: "orçamento(s) criado(s)",
  declaracoesSaida: "declaração(ões) de saída emitida(s)",
  qualidadeRegistrada: "avaliação(ões) de qualidade",
} as const;

const HISTORICO_MSG = "Desative em vez de excluir.";

export async function DELETE(req: NextRequest) {
  const auth = await requireApi(["ADMIN"]);
  if (!auth.ok) return auth.response;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  // O solicitante e um ADMIN ativo e nao pode ser o alvo — por isso nunca
  // sobra zero ADMIN, sem precisar de checagem extra.
  if (id === auth.user.id) return NextResponse.json({ error: "Você não pode excluir a si mesmo" }, { status: 400 });

  const alvo = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, role: true,
      _count: { select: { avariasRegistradas: true, orcamentos: true, declaracoesSaida: true, qualidadeRegistrada: true } },
    },
  });
  if (!alvo) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const travas = (Object.keys(TRAVAS) as (keyof typeof TRAVAS)[])
    .filter((k) => alvo._count[k] > 0)
    .map((k) => `${alvo._count[k]} ${TRAVAS[k]}`);
  if (travas.length) {
    return NextResponse.json(
      { error: `Usuário tem histórico (${travas.join(", ")}). ${HISTORICO_MSG}`, travas },
      { status: 409 },
    );
  }

  try {
    await prisma.user.delete({ where: { id } });
  } catch (e: any) {
    if (e?.code === "P2025") return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    // P2003 = chave estrangeira segurando: alguma relacao obrigatoria fora da lista acima.
    if (e?.code === "P2003") {
      return NextResponse.json({ error: `Usuário tem histórico vinculado. ${HISTORICO_MSG}`, travas: [] }, { status: 409 });
    }
    throw e;
  }

  const { ip, userAgent } = extractRequestMeta(req);
  await logAudit({
    tipo: "USUARIO_APAGADO",
    user: { id: auth.user.id, email: auth.user.email, name: auth.user.nome, role: auth.user.role },
    recursoTipo: "usuario",
    recursoId: alvo.id,
    recursoDesc: `${alvo.name || "—"} <${alvo.email || "—"}>`,
    metodo: "DELETE",
    rota: "/api/usuarios",
    ip,
    userAgent,
    detalhes: { role: alvo.role },
  });

  return NextResponse.json({ ok: true });
}
