import type { UsageSummaryRow } from '@as/types'
import { useT } from '../i18n'
import { formatUsd } from '../lib/usage'

const WIDTH = 720
const HEIGHT = 170
const PAD_LEFT = 52
const PAD_RIGHT = 12
const PAD_TOP = 12
const PAD_BOTTOM = 24
const PLOT_WIDTH = WIDTH - PAD_LEFT - PAD_RIGHT
const PLOT_HEIGHT = HEIGHT - PAD_TOP - PAD_BOTTOM
const MAX_X_LABELS = 8

// Rounds the top of the scale up to 1/2/5 × 10^n so the gridlines land on readable values,
// including the sub-cent costs a few requests produce.
function niceCeil(max: number): number {
  if (max <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(max))
  const residual = max / magnitude
  const unit = residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1
  return unit * magnitude
}

function formatDateLabel(date: string): string {
  const parts = date.split('-')
  return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : date
}

/** Cost per day as a line; the rollups are daily, so today is a single point. */
export function UsageTrendChart({ rows }: { rows: UsageSummaryRow[] }) {
  const t = useT()
  const byDate = new Map<string, { cost: number; requests: number }>()
  for (const row of rows) {
    const acc = byDate.get(row.date) ?? { cost: 0, requests: 0 }
    acc.cost += row.costUsd
    acc.requests += row.requestCount
    byDate.set(row.date, acc)
  }
  const dates = [...byDate.keys()].sort()
  if (dates.length === 0) return null

  const niceMax = niceCeil(Math.max(...dates.map((d) => byDate.get(d)!.cost), 0.0001))
  const x = (i: number) => PAD_LEFT + (dates.length === 1 ? PLOT_WIDTH / 2 : (i / (dates.length - 1)) * PLOT_WIDTH)
  const y = (v: number) => PAD_TOP + PLOT_HEIGHT - (v / niceMax) * PLOT_HEIGHT

  const points = dates.map((d, i) => ({ x: x(i), y: y(byDate.get(d)!.cost), d, ...byDate.get(d)! }))
  const pointsAttr = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const bottomY = (PAD_TOP + PLOT_HEIGHT).toFixed(1)
  const areaPoints = `${x(0).toFixed(1)},${bottomY} ${pointsAttr} ${x(dates.length - 1).toFixed(1)},${bottomY}`
  const gridlines = [0, 0.5, 1].map((f) => ({ v: niceMax * f, y: y(niceMax * f) }))
  const labelEvery = Math.ceil(points.length / MAX_X_LABELS)

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={t('usagePage.chart')} className="mt-2.5 block h-[170px] w-full">
      {gridlines.map((g) => (
        <g key={g.v}>
          <line x1={PAD_LEFT} y1={g.y} x2={WIDTH - PAD_RIGHT} y2={g.y} stroke="var(--line)" strokeDasharray={g.v === 0 ? undefined : '3 4'} />
          <text x={PAD_LEFT - 8} y={g.y} fill="var(--fg3)" fontSize={10} textAnchor="end" dominantBaseline="middle" className="font-mono">
            {formatUsd(g.v)}
          </text>
        </g>
      ))}
      {points.length > 1 && <polygon points={areaPoints} fill="rgb(var(--mcp-rgb) / 0.12)" />}
      {points.length > 1 && (
        <polyline points={pointsAttr} fill="none" stroke="var(--mcp)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      )}
      {points.map((p, i) => (
        <g key={p.d}>
          <circle cx={p.x} cy={p.y} r={3.4} fill="var(--bg-2)" stroke="var(--mcp)" strokeWidth={2}>
            <title>{`${formatDateLabel(p.d)} · ${formatUsd(p.cost)} · ${p.requests}`}</title>
          </circle>
          {(i % labelEvery === 0 || i === points.length - 1) && (
            <text x={p.x} y={HEIGHT - 6} fill="var(--fg3)" fontSize={10} textAnchor="middle" className="font-mono">
              {formatDateLabel(p.d)}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}
