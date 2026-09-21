import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

/**
 * Recusa de API é JSON, nunca redirect.
 *
 * O gate de /api/* aqui é a rede: cobre de uma vez os handlers que só olham a
 * sessão. A decisão final continua no handler, via requireApi — este token é
 * lido do cookie e pode estar um pouco atrás do banco, então aqui só barramos
 * o que é inequívoco (papel e flags explicitamente negativos).
 */
function gateApi(token: any, pathname: string) {
  if (!token) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (token.ativo === false) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (token.aprovado === false) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  // O portal é a única área de API do CLIENTE.
  if (pathname.startsWith("/api/portal")) {
    if (token.role !== "CLIENTE" && token.role !== "ADMIN") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }
    return NextResponse.next();
  }

  // Fora dela, CLIENTE não entra em nenhuma rota interna. Os papéis internos
  // entre si são separados no handler: a Sidebar não serve de regra aqui
  // porque há exceção deliberada (relatorios/fornecedor aceita OPERACIONAL
  // mesmo com a página /relatorios fechada para ele).
  if (token.role === "CLIENTE") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  return NextResponse.next();
}

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    if (pathname.startsWith("/api/")) return gateApi(token, pathname);

    // Conta desativada — vale para página também, senão desativar um usuário
    // fecha a API e deixa a tela de impressão (carta-frete, acerto de
    // motorista, declaração) abrindo até o token expirar.
    if ((token as any)?.ativo === false) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    // Cliente não aprovado
    if (token?.role === "CLIENTE" && !(token as any).aprovado) {
      return NextResponse.redirect(new URL("/aguardando-aprovacao", req.url));
    }

    // Portal do cliente — só CLIENTE aprovado ou ADMIN
    if (pathname.startsWith("/portal")) {
      if (token?.role !== "CLIENTE" && token?.role !== "ADMIN") {
        return NextResponse.redirect(new URL("/login", req.url));
      }
      return NextResponse.next();
    }

    // Redirect old routes to unified page
    if (pathname === "/notas") {
      return NextResponse.redirect(new URL("/importacao?tab=notas", req.url));
    }
    if (pathname === "/consulta-danfe") {
      return NextResponse.redirect(new URL("/importacao?tab=danfe", req.url));
    }

    // Conferente — só pode acessar kanban, agendamentos, avarias e entregas (somente leitura)
    if (token?.role === "CONFERENTE" && !pathname.startsWith("/kanban") && !pathname.startsWith("/agendamentos") && !pathname.startsWith("/avarias") && !pathname.startsWith("/entregas") && !pathname.startsWith("/imprimir")) {
      return NextResponse.redirect(new URL("/kanban", req.url));
    }

    // Financeiro — bloqueia OPERACIONAL
    if (pathname.startsWith("/financeiro") && token?.role === "OPERACIONAL") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    // Relatórios — bloqueia OPERACIONAL
    if (pathname.startsWith("/relatorios") && token?.role === "OPERACIONAL") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    // Usuários — só ADMIN
    if (pathname.startsWith("/usuarios") && token?.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Em /api/* deixamos passar para a função acima responder 401 em JSON.
        // Recusar aqui devolveria um 307 para /login, que um fetch lê como
        // sucesso e tenta parsear como dado.
        if (req.nextUrl.pathname.startsWith("/api/")) return true;
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/entregas/:path*",
    "/importacao/:path*",
    "/kanban/:path*",
    "/rotas/:path*",
    "/motoristas/:path*",
    "/veiculos/:path*",
    "/financeiro/:path*",
    "/relatorios/:path*",
    "/notas",
    "/consulta-danfe",
    "/usuarios/:path*",
    "/portal/:path*",
    "/avarias/:path*",
    // Fora do grupo (dashboard): sem esta entrada as paginas de impressao nao
    // tinham NENHUM gate. Cada pagina tambem checa a sessao por conta propria.
    "/imprimir/:path*",
    // Toda a API menos o que e publico por contrato: o proprio NextAuth, o
    // link do motorista (/api/public), o rastreio por id e o webhook do
    // WhatsApp, que autentica por HMAC e nao por sessao.
    "/api/((?!auth|public|tracking|whatsapp/webhook).*)",
  ],
};
