import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { orgMembers } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { OnboardingWizard } from "./_components/OnboardingWizard"

export default async function OnboardingPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const membership = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(eq(orgMembers.userId, session.user.id))
    .limit(1)

  if (membership.length > 0) redirect("/dashboard")

  return <OnboardingWizard />
}
