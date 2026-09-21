import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth/server"
import { AuthError } from "@/lib/auth/errors"
import { getMyProfileAction } from "@/domains/account/actions"
import AccountView from "./_components/AccountView"

export const dynamic = "force-dynamic"

export default async function AccountPage() {
  try {
    await requireUser()
  } catch (e) {
    if (e instanceof AuthError) redirect("/login")
    throw e
  }

  const profile = await getMyProfileAction()
  if (!profile) redirect("/login")

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Mi cuenta</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Gestiona tu información personal y credenciales de acceso.
        </p>
      </div>
      <AccountView profile={profile} />
    </div>
  )
}
