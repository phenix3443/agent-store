// Compact download formatting matching the design (e.g. 142k, 1.2M).
export function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

const sentences = new Intl.Segmenter(undefined, { granularity: 'sentence' })

// Registry descriptions are the publisher's own text, often a skill's trigger
// instructions cut at a fixed length. Listings show the first whole sentence so
// a summary never ends mid-word; the full text stays on the detail page.
export function leadSentence(text: string): string {
  const first = sentences.segment(text.trim())[Symbol.iterator]().next().value
  return (first?.segment ?? text).trim()
}
