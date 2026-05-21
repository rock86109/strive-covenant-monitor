import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import Resend from "next-auth/providers/resend"
import { db } from "@/lib/db"
import { authConfig } from "@/auth.config"

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: "Covenant Monitor <noreply@dannyjiang.net>",
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string
      return session
    },
  },
})
