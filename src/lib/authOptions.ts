import { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

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
        if (!user || !user.password) return null;
        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;
        if (!user.ativo) throw new Error("Usuário inativo");
        return { id: user.id, email: user.email, name: user.name, role: user.role, aprovado: user.aprovado };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const existing = await prisma.user.findUnique({ where: { email: user.email! } });
        if (existing && !existing.ativo) return false;
        // New Google users need admin approval for internal access
        if (!existing) {
          await prisma.user.update({
            where: { email: user.email! },
            data: { aprovado: false, role: "CLIENTE" },
          }).catch(() => {}); // may not exist yet, adapter creates it
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
};
