export const SYMBOLS = {
  enabled: '✓',
  disabled: '✗',
  update: '↑',
} as const

export function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) {
    const val = Math.floor(n / 1_000 * 10) / 10
    return `${val.toFixed(1).replace(/\.0$/, '')}K`
  }
  return String(n)
}

export function padEnd(s: string, len: number): string {
  if (s.length > len) return s.slice(0, len - 1) + '…'
  return s.padEnd(len)
}

export function formatTable(
  headers: string[],
  rows: string[][],
  colWidths: number[]
): string[] {
  const formatRow = (cells: string[]) =>
    cells.map((c, i) => padEnd(c, colWidths[i])).join(' ').trimEnd()

  const headerLine = formatRow(headers)
  const separator = colWidths.map(w => '─'.repeat(w)).join(' ').trimEnd()
  const dataLines = rows.map(formatRow)
  return [headerLine, separator, ...dataLines]
}

export function formatStep(label: string, status?: string): string {
  const padded = ('  ' + label).padEnd(38)
  return status !== undefined ? `${padded}${status}` : padded
}
