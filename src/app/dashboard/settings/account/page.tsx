import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth/server"
import { AuthError } from "@/lib/auth/errors"
import { getMyProfileAction } from "@/domains/account/actions"
import { PageShell, PageHeader } from "@/components/app/ops"
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
    <PageShell>
      <PageHeader title="Mi cuenta" subtitle="Tus datos personales y de acceso." />
      <div className="max-w-3xl">
        <AccountView profile={profile} />
      </div>
    </PageShell>
  )
}
