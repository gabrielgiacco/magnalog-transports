import { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { logAudit } from "@/lib/audit";

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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const inputEmail = credentials.email.toLowerCase().trim();
        const user = await prisma.user.findFirst({
          where: { email: { equals: inputEmail, mode: "insensitive" } },
        });
        if (!user || !user.password) {
          await logAudit({ tipo: "LOGIN_FAIL", sucesso: false, user: { email: inputEmail }, detalhes: { motivo: "usuario_nao_encontrado" } });
          return null;
        }
        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) {
          await logAudit({ tipo: "LOGIN_FAIL", sucesso: false, user: { id: user.id, email: user.email, name: user.name, role: user.role }, detalhes: { motivo: "senha_invalida" } });
          return null;
        }
        if (!user.ativo) {
          await logAudit({ tipo: "LOGIN_FAIL", sucesso: false, user: { id: user.id, email: user.email, name: user.name, role: user.role }, detalhes: { motivo: "usuario_inativo" } });
          throw new Error("Usuário inativo");
        }
        await logAudit({ tipo: "LOGIN", user: { id: user.id, email: user.email, name: user.name, role: user.role }, detalhes: { provider: "credentials" } });
        return { id: user.id, email: user.email, name: user.name, role: user.role, aprovado: user.aprovado };
      },
    }),
  ],
  session: { strategy: "jwt" },
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
      if (dbUser) {
        token.role = dbUser.role;
        token.aprovado = dbUser.aprovado;
        token.userId = dbUser.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).aprovado = token.aprovado;
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
