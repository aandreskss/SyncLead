/** Microtendencia discreta. Devuelve null si no hay al menos 2 puntos con variación. */
export function Sparkline({ points, color, label, width = 72, height = 28 }: { points: number[]; color: string; label: string; width?: number; height?: number }) {
  if (points.length < 2) return null
  const max = Math.max(...points)
  if (max <= 0) return null
  const xs = points.map((_, i) => 1.5 + (i * (width - 3)) / (points.length - 1))
  const ys = points.map((v) => height - 3 - (v / max) * (height - 7))
  const poly = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ")
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="shrink-0">
      <polyline points={poly} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={2.5} fill={color} />
    </svg>
  )
}
