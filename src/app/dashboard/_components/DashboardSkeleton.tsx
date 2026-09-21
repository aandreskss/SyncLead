/** Skeleton con la misma estructura que el dashboard: evita saltos de layout al cargar. */
export function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-label="Cargando el resumen">
      <div className="grid grid-cols-2 rounded-lg border border-ops-line bg-ops-s1 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`p-5 ${i < 3 ? "lg:border-r lg:border-ops-line" : ""}`}>
            <div className="h-3.5 w-28 rounded bg-ops-raised" />
            <div className="mt-4 h-8 w-20 rounded bg-ops-raised" />
            <div className="mt-4 h-3.5 w-36 rounded bg-ops-raised" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="rounded-lg border border-ops-line bg-ops-s1 p-5 lg:col-span-8">
          <div className="h-4 w-48 rounded bg-ops-raised" />
          <div className="mt-2 h-3 w-32 rounded bg-ops-raised" />
          <div className="mt-5 h-[260px] rounded bg-ops-raised/60" />
        </div>
        <div className="rounded-lg border border-ops-line bg-ops-s1 p-5 lg:col-span-4">
          <div className="h-4 w-40 rounded bg-ops-raised" />
          <div className="mt-6 space-y-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-5 rounded bg-ops-raised" />
            ))}
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-ops-line bg-ops-s1 p-5">
        <div className="h-4 w-52 rounded bg-ops-raised" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="mt-4 flex gap-4 border-b border-ops-line pb-4">
            <div className="h-4 flex-[2] rounded bg-ops-raised" />
            <div className="h-4 flex-1 rounded bg-ops-raised" />
            <div className="h-4 flex-1 rounded bg-ops-raised" />
            <div className="h-4 flex-1 rounded bg-ops-raised" />
          </div>
        ))}
      </div>
      <div className="grid gap-px rounded-lg border border-ops-line bg-ops-line lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-ops-s1 p-6">
            <div className="h-4 w-44 rounded bg-ops-raised" />
            <div className="mt-5 h-2.5 rounded bg-ops-raised" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="h-4 rounded bg-ops-raised" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
