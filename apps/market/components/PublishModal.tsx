'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import type { Item } from '@aas/types'
import { X } from 'lucide-react'
import { FIELD_SCHEMAS, type PublishType } from '@/lib/publish-field-schemas'
import { useClientState } from './ClientStateProvider'

interface PublishModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const TYPE_LABELS: Record<PublishType, string> = { provider: '供应商', skill: '技能', mcp: 'MCP' }

function buildItem(type: PublishType, vals: Record<string, string>): Item {
  const base = {
    id: `user-${Date.now()}`,
    slug: (vals.name ?? 'untitled').toLowerCase().replace(/\s+/g, '-'),
    name: vals.name ?? 'Untitled',
    description: vals.homepage ?? vals.repo ?? '',
    readmeUrl: '',
    icon: '',
    version: '0.1.0',
    publisher: { id: 'me', slug: 'me', name: '我', avatarUrl: '', tier: 'community' as const },
    compatibleWith: ['claude', 'codex'] as ('claude' | 'codex')[],
    tags: [],
    downloads: 0,
    rating: 0,
    status: 'published' as const,
    installHook: { steps: [] },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }

  if (type === 'provider') {
    return {
      ...base,
      category: 'provider',
      configSchema: {},
      supportedModels: (vals.supportedModels ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    }
  }
  if (type === 'skill') {
    return { ...base, category: 'skill', contentUrl: '' }
  }
  if (vals.transport === 'stdio') {
    return { ...base, category: 'mcp', transport: 'stdio', serverCommand: vals.command ?? '', configSchema: {} }
  }
  let headers: Record<string, string> | undefined
  if (vals.headers) {
    try {
      headers = JSON.parse(vals.headers)
    } catch {
      headers = undefined
    }
  }

  return {
    ...base,
    category: 'mcp',
    transport: (vals.transport as 'sse' | 'http') ?? 'http',
    url: vals.url ?? '',
    configSchema: {},
    ...(headers ? { headers } : {}),
  }
}

export function PublishModal({ open, onOpenChange }: PublishModalProps) {
  const { addUserItem } = useClientState()
  const [type, setType] = useState<PublishType>('provider')
  const [vals, setVals] = useState<Record<string, string>>({})

  const fields = FIELD_SCHEMAS[type].filter((f) => !f.when || f.when(vals))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    addUserItem(buildItem(type, vals))
    setVals({})
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-store-border bg-store-content p-6">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-store-text">发布资源</Dialog.Title>
            <Dialog.Close aria-label="关闭" className="text-store-text-2 hover:text-store-text">
              <X size={18} />
            </Dialog.Close>
          </div>

          <div className="mb-4 flex gap-2">
            {(Object.keys(TYPE_LABELS) as PublishType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setType(t); setVals({}) }}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  type === t ? 'bg-store-panel-2 text-store-text' : 'text-store-text-2'
                }`}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {fields.map((field) => (
              <div key={field.key}>
                <label htmlFor={`publish-${field.key}`} className="mb-1 block text-xs font-medium text-store-text-2">
                  {field.label}
                </label>
                {field.type === 'select' ? (
                  <select
                    id={`publish-${field.key}`}
                    value={vals[field.key] ?? ''}
                    onChange={(e) => setVals((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    className="w-full rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
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
                    className="w-full rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
                  />
                )}
              </div>
            ))}

            <button
              type="submit"
              className="mt-2 rounded-lg bg-store-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              发布
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
