import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// Custo do bcrypt. 12 e o piso recomendado hoje; hashes antigos (custo 10)
// continuam validando normalmente e sobem para 12 quando a senha for trocada.
const BCRYPT_ROUNDS = 12;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

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
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = session.user as any;
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const hash = await bcrypt.hash(body.password || "Magnalog@2025", BCRYPT_ROUNDS);

  const novo = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      password: hash,
      role: body.role || "OPERACIONAL",
      aprovado: true,
      ativo: true,
    },
  });

  return NextResponse.json({ id: novo.id, name: novo.name, email: novo.email, role: novo.role }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

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
