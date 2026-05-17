import type { NextAuthConfig } from "next-auth"

// Lightweight config for edge middleware — no Prisma, no Node.js-only modules
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/auth/signin",
    verifyRequest: "/auth/verify",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user
      const isAuthPage = request.nextUrl.pathname.startsWith("/auth")
      const isApiAuthRoute = request.nextUrl.pathname.startsWith("/api/auth")
      if (isApiAuthRoute || isAuthPage) return true
      return isLoggedIn
    },
  },
}
