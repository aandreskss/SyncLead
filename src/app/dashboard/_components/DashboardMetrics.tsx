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
  clientId?: string
}

export async function DashboardMetrics({ orgId, from, to, prevFrom, prevTo, clientId }: Props) {
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
    getKPIMetrics(orgId, from, to, clientId),
    getKPIMetrics(orgId, prevFrom, prevTo, clientId),
    getLeadsByDay(orgId, from, to, clientId),
    getLeadsByCampaignChart(orgId, from, to, clientId),
    getLeadsByUtmContent(orgId, from, to, clientId),
    getLeadsByPlatform(orgId, from, to, clientId),
    getLeadsByDevice(orgId, from, to, clientId),
    getTopCities(orgId, from, to, clientId),
    getLeadsByTemperatureDay(orgId, from, to, clientId),
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
