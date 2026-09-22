import { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { logAudit } from "@/lib/audit";
import { extrairIp, verificarLimiteLogin, MENSAGEM_BLOQUEIO } from "@/lib/login-rate-limit";

/**
 * Navegador/aparelho de quem tentou entrar.
 *
 * Sem isto, falha de login era o unico evento da auditoria sem User-Agent — e
 * na hora de saber se o cliente errou a senha no PC ou no celular nao dava pra
 * responder. Leitura direta porque o `req` do authorize entrega os headers
 * como objeto simples, e nao como um Request com headers.get().
 */
function extrairUserAgent(headers: Record<string, any> | undefined): string {
  const v = headers?.["user-agent"] ?? headers?.["User-Agent"];
  return String((Array.isArray(v) ? v[0] : v) || "");
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;
        const inputEmail = credentials.email.toLowerCase().trim();
        const ip = extrairIp(req?.headers as any);
        const userAgent = extrairUserAgent(req?.headers as any);

        // Freio antes de qualquer comparação de senha: sem isto, bcrypt custo 12
        // vira só um atraso por tentativa, não um limite.
        const limite = await verificarLimiteLogin(inputEmail, ip);
        if (limite.bloqueado) {
          await logAudit({
            tipo: "LOGIN_FAIL", sucesso: false, ip, userAgent,
            user: { email: inputEmail },
            detalhes: { motivo: "bloqueado_rate_limit", regra: limite.motivo, falhas: limite.falhas },
          });
          throw new Error(MENSAGEM_BLOQUEIO);
        }

        const user = await prisma.user.findFirst({
          where: { email: { equals: inputEmail, mode: "insensitive" } },
        });
        if (!user || !user.password) {
          await logAudit({ tipo: "LOGIN_FAIL", sucesso: false, ip, userAgent, user: { email: inputEmail }, detalhes: { motivo: "usuario_nao_encontrado" } });
          return null;
        }
        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) {
          await logAudit({ tipo: "LOGIN_FAIL", sucesso: false, ip, userAgent, user: { id: user.id, email: user.email, name: user.name, role: user.role }, detalhes: { motivo: "senha_invalida" } });
          return null;
        }
        if (!user.ativo) {
          await logAudit({ tipo: "LOGIN_FAIL", sucesso: false, ip, userAgent, user: { id: user.id, email: user.email, name: user.name, role: user.role }, detalhes: { motivo: "usuario_inativo" } });
          throw new Error("Usuário inativo");
        }
        await logAudit({ tipo: "LOGIN", ip, userAgent, user: { id: user.id, email: user.email, name: user.name, role: user.role }, detalhes: { provider: "credentials" } });
        return { id: user.id, email: user.email, name: user.name, role: user.role, aprovado: user.aprovado };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    // 12h cobre um turno inteiro sem relogin e evita o padrao de 30 dias, em
    // que um token roubado valia um mes. Revogar acesso nao depende disto: o
    // callback `jwt` abaixo rele `ativo` do banco a cada requisicao.
    maxAge: 12 * 60 * 60,
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const existing = await prisma.user.findUnique({ where: { email: user.email! } });
        if (existing && !existing.ativo) {
          await logAudit({ tipo: "LOGIN_FAIL", sucesso: false, user: { id: existing.id, email: existing.email, name: existing.name, role: existing.role }, detalhes: { motivo: "usuario_inativo", provider: "google" } });
          return false;
        }
        // New Google users need admin approval for internal access
        if (!existing) {
          await prisma.user.update({
            where: { email: user.email! },
            data: { aprovado: false, role: "CLIENTE" },
          }).catch(() => {}); // may not exist yet, adapter creates it
        }
        if (existing) {
          await logAudit({ tipo: "LOGIN", user: { id: existing.id, email: existing.email, name: existing.name, role: existing.role }, detalhes: { provider: "google" } });
        }
      }
      return true;
    },
    async jwt({ token }) {
      // Always fetch latest role/aprovado from DB so admin changes take effect immediately
      const dbUser = await prisma.user.findUnique({ where: { email: token.email! } });
      // O e-mail pode ser reaproveitado depois de uma exclusao: o token do
      // usuario antigo nao pode virar sessao da conta nova. Sem userId ainda
      // (primeira passagem apos o login) aceita; depois, so o mesmo id.
      if (dbUser && (!token.userId || token.userId === dbUser.id)) {
        token.role = dbUser.role;
        token.aprovado = dbUser.aprovado;
        // Sem reler `ativo` aqui, desativar um usuario so barrava login novo: o
        // JWT ja emitido (maxAge padrao de 30 dias) seguia abrindo a API.
        token.ativo = dbUser.ativo;
        token.userId = dbUser.id;
      } else {
        // Usuario apagado do banco: o token que ele ainda tem na mao nao pode
        // continuar valendo.
        token.ativo = false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).aprovado = token.aprovado;
        (session.user as any).ativo = token.ativo;
        (session.user as any).id = token.userId;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  events: {
    async signOut({ token }: any) {
      if (token?.email) {
        await logAudit({
          tipo: "LOGOUT",
          user: { id: token.userId, email: token.email, name: token.name, role: token.role },
        });
      }
    },
  },
};
