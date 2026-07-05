import type { UsageSummaryRow } from '@aas/types'

const WIDTH = 280
const HEIGHT = 60

export function UsageTrendChart({ rows }: { rows: UsageSummaryRow[] }) {
  const byDate = new Map<string, number>()
  for (const row of rows) {
    byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.costUsd)
  }
  const dates = [...byDate.keys()].sort()

  if (dates.length === 0) {
    return (
      <div className="relative flex h-[60px] items-center justify-center text-xs text-store-text-3">
        <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="absolute inset-0 text-store-accent" />
        <span>暂无用量数据</span>
      </div>
    )
  }

  const costs = dates.map((d) => byDate.get(d)!)
  const max = Math.max(...costs, 0.0001)
  const points = dates
    .map((d, i) => {
      const x = dates.length === 1 ? WIDTH / 2 : (i / (dates.length - 1)) * WIDTH
      const y = HEIGHT - (byDate.get(d)! / max) * HEIGHT
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const areaPath = `M${points.split(' ')[0]!.replace(',', ' ')} L${points.replace(/ /g, ' L')} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`

  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="text-store-accent">
      <path d={areaPath} fill="currentColor" opacity={0.15} stroke="none" />
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={2} />
    </svg>
  )
}
