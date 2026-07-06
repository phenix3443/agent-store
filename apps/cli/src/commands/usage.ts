import type { AASEngine, ToolTarget } from '@as/types'
import { formatTable } from '../utils/format'

function getFlag(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : undefined
}

export async function runUsage(
  engine: AASEngine,
  args: string[],
  out: (s: string) => void = console.log
): Promise<void> {
  const daysFlag = getFlag(args, '--days')
  const rows = await engine.getUsageSummary({
    days: daysFlag ? Number(daysFlag) : undefined,
    providerSlug: getFlag(args, '--provider'),
    target: getFlag(args, '--for') as ToolTarget | undefined,
  })

  if (rows.length === 0) {
    out('No usage data.')
    return
  }

  const WIDTHS = [12, 16, 8, 20, 8, 8, 10, 10]
  const headers = ['DATE', 'PROVIDER', 'TARGET', 'MODEL', 'REQS', 'OK', 'TOKENS', 'COST']
  const tableRows = rows.map(r => [
    r.date,
    r.providerSlug,
    r.target,
    r.model,
    String(r.requestCount),
    String(r.successCount),
    String(r.inputTokens + r.outputTokens),
    r.unpricedRequestCount > 0 && r.costUsd === 0 ? '—' : `$${r.costUsd.toFixed(4)}`,
  ])
  formatTable(headers, tableRows, WIDTHS).forEach(line => out(line))
}
