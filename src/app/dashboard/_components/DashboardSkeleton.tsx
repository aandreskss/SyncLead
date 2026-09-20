export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="h-3 w-24 bg-zinc-800 rounded mb-3" />
            <div className="h-8 w-20 bg-zinc-800 rounded mb-2" />
            <div className="h-3 w-16 bg-zinc-800 rounded" />
          </div>
        ))}
      </div>

      {/* Line chart */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="h-3 w-36 bg-zinc-800 rounded mb-4" />
        <div className="h-[280px] bg-zinc-800/50 rounded" />
      </div>

      {/* 2-col charts */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, j) => (
            <div key={j} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="h-3 w-32 bg-zinc-800 rounded mb-4" />
              <div className="h-[240px] bg-zinc-800/50 rounded" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
