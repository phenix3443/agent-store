import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import type { UsageSummaryRow } from '@as/types'
import { getDailySummary } from './queries'

export type ExportFormat = 'csv' | 'json'

const CSV_COLUMNS: { header: string; get: (r: UsageSummaryRow) => string | number }[] = [
  { header: 'date', get: (r) => r.date },
  { header: 'provider', get: (r) => r.providerSlug },
  { header: 'target', get: (r) => r.target },
  { header: 'model', get: (r) => r.model },
  { header: 'requests', get: (r) => r.requestCount },
  { header: 'success', get: (r) => r.successCount },
  { header: 'inputTokens', get: (r) => r.inputTokens },
  { header: 'outputTokens', get: (r) => r.outputTokens },
  { header: 'cacheReadTokens', get: (r) => r.cacheReadTokens },
  { header: 'cacheWriteTokens', get: (r) => r.cacheWriteTokens },
  { header: 'costUsd', get: (r) => r.costUsd },
]

function csvCell(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Serializes usage rows to CSV or pretty JSON. Pure — the caller supplies the rows. */
export function formatUsageExport(rows: UsageSummaryRow[], format: ExportFormat): string {
  if (format === 'json') return JSON.stringify(rows, null, 2)
  const lines = [CSV_COLUMNS.map((c) => c.header).join(',')]
  for (const row of rows) lines.push(CSV_COLUMNS.map((c) => csvCell(c.get(row))).join(','))
  return lines.join('\n')
}

/** Writes a usage export to <aasHome>/exports/ and returns the file path. */
export async function exportUsageToFile(
  aasHome: string,
  format: ExportFormat,
  options: { days?: number } = {}
): Promise<string> {
  const rows = getDailySummary(aasHome, { days: options.days ?? 30 })
  const content = formatUsageExport(rows, format)
  const dir = join(aasHome, 'exports')
  await mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const path = join(dir, `usage-${stamp}.${format}`)
  await writeFile(path, content)
  return path
}
