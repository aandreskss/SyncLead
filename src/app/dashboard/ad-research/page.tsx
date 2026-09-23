import { requireOrganizationMembership } from "@/lib/auth/server"
import { redirect } from "next/navigation"
import { AdResearchDashboard } from "./_components/AdResearchDashboard"
import { getCollectionsAction, getSavedAdsAction } from "@/domains/ad-research/actions"

export default async function AdResearchPage() {
  let ctx
  try {
    ctx = await requireOrganizationMembership()
  } catch {
    redirect("/login")
  }

  const [collections, savedAds] = await Promise.all([
    getCollectionsAction(),
    getSavedAdsAction(),
  ])

  return (
    <AdResearchDashboard
      initialCollections={collections.data ?? []}
      initialSavedAds={savedAds.data ?? []}
    />
  )
}
