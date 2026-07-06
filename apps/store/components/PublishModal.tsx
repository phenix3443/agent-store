'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { StoreClient, type CreateItemBody } from '@as/sdk'
import { createClient } from '@/lib/supabase/client'
import { CATEGORY_META, CategoryGlyph } from '@/lib/item-meta'
import { FIELD_SCHEMAS, type PublishType } from '@/lib/publish-field-schemas'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001'

interface PublishModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const TYPE_LABELS: Record<PublishType, string> = { provider: '供应商', skill: '技能', mcp: 'MCP' }

function buildCreateBody(type: PublishType, vals: Record<string, string>): CreateItemBody {
  const name = vals.name ?? 'Untitled'
  const base: CreateItemBody = {
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    description: vals.homepage ?? vals.repo ?? '',
    category: type,
    version: '0.1.0',
    compatibleWith: ['claude', 'codex'],
    tags: [],
  }

  if (type === 'provider') {
    return {
      ...base,
      metadata: { supportedModels: (vals.supportedModels ?? '').split(',').map((s) => s.trim()).filter(Boolean) },
    }
  }
  if (type === 'mcp') {
    if (vals.transport === 'stdio') {
      return { ...base, metadata: { transport: 'stdio', serverCommand: vals.command ?? '' } }
    }
    let headers: Record<string, string> | undefined
    if (vals.headers) {
      try {
        headers = JSON.parse(vals.headers)
      } catch {
        headers = undefined
      }
    }
    return { ...base, metadata: { transport: vals.transport ?? 'http', url: vals.url ?? '', ...(headers ? { headers } : {}) } }
  }
  return base
}

export function PublishModal({ open, onOpenChange }: PublishModalProps) {
  const [type, setType] = useState<PublishType>('provider')
  const [vals, setVals] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const fields = FIELD_SCHEMAS[type].filter((f) => !f.when || f.when(vals))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) {
        setError('请先登录后再发布')
        return
      }
      const result = await new StoreClient(API_URL).createItem(buildCreateBody(type, vals), {
        token: session.access_token,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setVals({})
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '发布失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-store-border-strong bg-store-win">
          <div className="border-b border-store-border px-6 pb-3.5 pt-5">
            <Dialog.Title className="text-base font-bold text-store-text">发布资源到 Store</Dialog.Title>
            <p className="mt-0.5 font-mono text-[11.5px] text-store-text-3">agent-store publish</p>
          </div>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-col gap-4 overflow-y-auto px-6 py-5">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-store-text-2">资源类型</p>
                <div className="flex gap-2">
                  {(Object.keys(TYPE_LABELS) as PublishType[]).map((t) => {
                    const meta = CATEGORY_META[t]
                    const selected = type === t
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setType(t); setVals({}) }}
                        className="flex flex-1 flex-col items-center gap-1.5 rounded-lg border py-2.5 text-[16px]"
                        style={{
                          borderColor: selected ? meta.color : 'var(--border-strong)',
                          background: selected ? meta.soft : 'var(--panel)',
                        }}
                      >
                        <span style={{ color: meta.color }}>
                          <CategoryGlyph category={t} />
                        </span>
                        <span
                          className="text-[11px] font-semibold"
                          style={{ color: selected ? 'var(--text)' : 'var(--text-2)' }}
                        >
                          {TYPE_LABELS[t]}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {fields.map((field) => (
                <div key={field.key}>
                  <label htmlFor={`publish-${field.key}`} className="mb-1.5 block text-xs font-semibold text-store-text-2">
                    {field.label}
                  </label>
                  {field.type === 'select' && field.widget === 'pills' ? (
                    <div className="flex flex-wrap gap-1.5" id={`publish-${field.key}`}>
                      {field.options?.map((opt) => {
                        const selected = vals[field.key] === opt
                        return (
                          <button
                            key={opt}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setVals((prev) => ({ ...prev, [field.key]: opt }))}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                              selected
                                ? 'border-store-accent bg-store-accent-soft text-store-accent'
                                : 'border-store-border-strong bg-store-panel text-store-text-2 hover:text-store-text'
                            }`}
                          >
                            {opt}
                          </button>
                        )
                      })}
                    </div>
                  ) : field.type === 'select' ? (
                    <select
                      id={`publish-${field.key}`}
                      value={vals[field.key] ?? ''}
                      onChange={(e) => setVals((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      className="w-full rounded-lg border border-store-border-strong bg-store-panel px-3 py-2.5 text-sm text-store-text"
                    >
                      <option value="" disabled>请选择</option>
                      {field.options?.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`publish-${field.key}`}
                      type={field.type === 'url' ? 'url' : 'text'}
                      value={vals[field.key] ?? ''}
                      onChange={(e) => setVals((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      className="w-full rounded-lg border border-store-border-strong bg-store-panel px-3 py-2.5 font-mono text-[12.5px] text-store-text outline-none focus:border-store-accent"
                    />
                  )}
                </div>
              ))}
            </div>

            {error && (
              <p className="border-t border-store-border px-6 pt-3 text-xs text-store-red">{error}</p>
            )}
            <div className="flex justify-end gap-2 border-t border-store-border px-6 py-3.5">
              <Dialog.Close className="rounded-lg border border-store-border-strong px-4 py-2 text-sm font-semibold text-store-text-2 hover:bg-store-panel">
                取消
              </Dialog.Close>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-store-accent px-5 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
              >
                {busy ? '发布中…' : '发布'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
