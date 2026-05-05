import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

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
    if (token?.role === "CONFERENTE" && !pathname.startsWith("/kanban") && !pathname.startsWith("/agendamentos") && !pathname.startsWith("/avarias") && !pathname.startsWith("/entregas")) {
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
      authorized: ({ token }) => !!token,
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
  ],
};
