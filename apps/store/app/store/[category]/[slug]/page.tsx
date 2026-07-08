import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { Item } from '@as/types'
import { getItemBySlug } from '@/lib/catalog'
import { Badge } from '@/components/Badge'
import { CATEGORY_META, CategoryGlyph } from '@/lib/item-meta'

interface ItemDetailPageProps {
  params: { category: string; slug: string }
}

const CATEGORY_LABEL: Record<string, string> = { provider: '供应商', skill: '技能', mcp: 'MCP' }

export async function generateMetadata({ params }: ItemDetailPageProps): Promise<Metadata> {
  const item = await getItemBySlug(params.slug)
  if (!item) return { title: 'Not found' }
  const desc = item.description.slice(0, 160)
  return {
    title: `${item.name} — ${CATEGORY_LABEL[item.category] ?? item.category}`,
    description: desc,
    alternates: { canonical: `/store/${item.category}/${item.slug}` },
    openGraph: { type: 'article', title: item.name, description: desc },
  }
}

const RISK_META: Record<string, { label: string; color: string; soft: string }> = {
  low: { label: '低风险', color: 'var(--green)', soft: 'var(--green-soft)' },
  medium: { label: '中等风险', color: 'var(--amber)', soft: 'rgba(240,179,74,0.14)' },
  high: { label: '高风险', color: 'var(--red)', soft: 'rgba(243,103,95,0.14)' },
}

// What actually runs / is installed — disclosed so users know before installing.
function runInfo(item: Item): { label: string; value: string } | null {
  if (item.category === 'mcp') {
    return item.transport === 'stdio'
      ? { label: '将运行命令', value: item.serverCommand }
      : { label: '将连接远程', value: item.url }
  }
  if (item.category === 'skill') return { label: '将安装文件', value: item.contentUrl }
  return { label: '将预填供应商连接', value: '安装时写入接入地址，你只需补充 API Key' }
}

export default async function ItemDetailPage({ params }: ItemDetailPageProps) {
  const item = await getItemBySlug(params.slug)

  if (!item || item.category !== params.category) notFound()

  const cat = CATEGORY_META[item.category]
  const review = item.review
  const risk = review ? (RISK_META[review.risk] ?? RISK_META.medium) : null
  const run = runInfo(item)

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <main className="py-8">
        <div className="mb-8 flex items-start gap-4">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-[28px]"
            style={{ background: cat.soft, color: cat.color }}
          >
            <CategoryGlyph category={item.category} />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-store-text">{item.name}</h1>
              <span className="text-store-text-3">v{item.version}</span>
              <Badge variant={item.publisher.tier}>{item.publisher.tier}</Badge>
              {risk && (
                <span
                  className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
                  style={{ background: risk.soft, color: risk.color, borderColor: risk.color }}
                >
                  {risk.label}
                </span>
              )}
            </div>
            <p className="mt-1 text-store-text-2">{item.description}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.tags.map((tag) => (
                <span key={tag} className="rounded-md border border-store-border bg-store-panel px-2 py-0.5 text-xs text-store-text-3">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        {review && (
          <div className="mb-4 rounded-xl border border-store-border bg-store-panel p-4">
            <div className="mb-2 flex items-center gap-2">
              <p className="text-sm font-medium text-store-text">安全审查</p>
              <span className="text-xs text-store-text-3">自动审查 · 质量 {review.quality}/5</span>
            </div>
            <p className="text-[13px] text-store-text-2">{review.summary}</p>
            {review.concerns?.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {review.concerns.map((c) => (
                  <li key={c} className="text-xs text-store-text-3">⚠️ {c}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="rounded-xl border border-store-border bg-store-panel p-4">
          <p className="mb-2 text-sm font-medium text-store-text">Install</p>
          <code className="block rounded-lg border border-store-border bg-store-content px-3 py-2 font-mono text-xs text-store-text">
            agent-store add {item.slug}
          </code>
          {run && (
            <p className="mt-2 text-xs text-store-text-3">
              {run.label}：<span className="font-mono text-store-text-2">{run.value}</span>
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
