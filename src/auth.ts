import NextAuth from "next-auth"
import type { JWT } from "next-auth/jwt"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "@/lib/db"
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { compare } from "bcryptjs"

// DrizzleAdapter inspeciona o db no nível de módulo (getPrototypeOf, has…).
// Sem DATABASE_URL (ex: build time) deixamos o adapter undefined —
// JWT strategy não precisa do adapter para validar sessões.
const adapter = process.env.DATABASE_URL
  ? DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    })
  : undefined

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter,
  // JWT strategy: session data is encoded in the cookie so the middleware
  // can read it without a DB round-trip on every request.
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        try {
          const user = await db.query.users.findFirst({
            where: eq(users.email, credentials.email as string),
          })

          if (!user?.password) return null

          const valid = await compare(credentials.password as string, user.password)
          if (!valid) return null

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
          }
        } catch (error) {
          console.error("[authorize]", error instanceof Error ? error.message : String(error))
          return null
        }
      },
    }),
  ],
  callbacks: {
    // Persist user.id into the JWT on first login
    jwt({ token, user }: { token: JWT; user?: { id?: string } }) {
      if (user?.id) token.sub = user.id
      return token
    },
    // Expose user.id from the JWT in session.user
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub
      return session
    },
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/verify-email",
    newUser: "/onboarding",
  },
})
