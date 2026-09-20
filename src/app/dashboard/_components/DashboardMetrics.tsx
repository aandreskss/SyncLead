import {
  getKPIMetrics,
  getLeadsByDay,
  getLeadsByCampaignChart,
  getLeadsByUtmContent,
  getLeadsByPlatform,
  getLeadsByDevice,
  getTopCities,
  getLeadsByTemperatureDay,
} from "@/domains/analytics/repository"
import { KPICards } from "./KPICards"
import { ChartsClient } from "./ChartsClient"

interface Props {
  orgId: string
  from: Date
  to: Date
  prevFrom: Date
  prevTo: Date
}

export async function DashboardMetrics({ orgId, from, to, prevFrom, prevTo }: Props) {
  const [
    current,
    prev,
    byDay,
    byCampaign,
    byUtm,
    byPlatform,
    byDevice,
    byCities,
    byTempDay,
  ] = await Promise.all([
    getKPIMetrics(orgId, from, to),
    getKPIMetrics(orgId, prevFrom, prevTo),
    getLeadsByDay(orgId, from, to),
    getLeadsByCampaignChart(orgId, from, to),
    getLeadsByUtmContent(orgId, from, to),
    getLeadsByPlatform(orgId, from, to),
    getLeadsByDevice(orgId, from, to),
    getTopCities(orgId, from, to),
    getLeadsByTemperatureDay(orgId, from, to),
  ])

  return (
    <div className="space-y-6">
      <KPICards current={current} prev={prev} />
      <ChartsClient
        byDay={byDay}
        byCampaign={byCampaign}
        byUtm={byUtm}
        byPlatform={byPlatform}
        byDevice={byDevice}
        byCities={byCities}
        byTempDay={byTempDay}
      />
    </div>
  )
}
