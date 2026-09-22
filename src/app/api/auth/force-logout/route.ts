import { signOut } from "@/auth"

// Called when a session is stale — user or org was deleted but the JWT cookie
// is still present. signOut() clears the cookie, breaking the redirect loop
// (proxy sees valid JWT → /dashboard → no org → /login → proxy loops).
export async function GET() {
  await signOut({ redirectTo: "/login" })
}
