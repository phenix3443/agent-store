import { ExternalLink } from 'lucide-react'
import { useSelectedDetail } from '../lib/useSelectedDetail'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-store-text-3">{label}</dt>
      <dd className="text-store-text">{value}</dd>
    </div>
  )
}

export function InfoSidebar() {
  const detail = useSelectedDetail()

  if (!detail) {
    return <aside className="w-64 shrink-0 border-l border-store-border bg-store-sidebar" />
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-6 overflow-y-auto border-l border-store-border bg-store-sidebar p-4">
      <div>
        <h3 className="mb-2 text-xs font-semibold text-store-text-2">安装信息</h3>
        <dl className="flex flex-col gap-1 text-xs">
          <Row label="标识" value={detail.slug} />
          <Row label="版本" value={`v${detail.version}`} />
          {detail.installed && (
            <Row label="更新时间" value={new Date(detail.updatedAt).toLocaleDateString()} />
          )}
        </dl>
      </div>

      {!detail.installed && (
        <div>
          <h3 className="mb-2 text-xs font-semibold text-store-text-2">市场</h3>
          <dl className="flex flex-col gap-1 text-xs">
            <Row label="发布" value={new Date(detail.createdAt).toLocaleDateString()} />
            <Row label="最近发布" value={new Date(detail.updatedAt).toLocaleDateString()} />
          </dl>
        </div>
      )}

      {detail.tags.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold text-store-text-2">分类</h3>
          <div className="flex flex-wrap gap-1">
            {detail.tags.map((tag) => (
              <span key={tag} className="rounded-md bg-store-panel-2 px-2 py-0.5 text-xs text-store-text-2">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {detail.readmeUrl && (
        <div>
          <h3 className="mb-2 text-xs font-semibold text-store-text-2">资源</h3>
          <a
            href={detail.readmeUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-store-accent hover:underline"
          >
            <ExternalLink size={12} /> 官网 / 文档
          </a>
        </div>
      )}
    </aside>
  )
}
