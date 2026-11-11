'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { SubmitManifest } from '@as/sdk'
import { FIELD_SCHEMAS, type PublishType } from '@/lib/publish-field-schemas'
import { PlateMarks } from './PlateMarks'

const REGISTRY_URL = 'https://github.com/awesome-agent-store/registry'

interface PublishModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const TYPES: PublishType[] = ['provider', 'skill', 'mcp']

function buildManifest(type: PublishType, vals: Record<string, string>): SubmitManifest {
  const name = vals.name?.trim() || 'Untitled'
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'package'
  const base = {
    slug,
    name,
    description: (vals.homepage || vals.repo || name).slice(0, 300),
    category: type,
    version: '0.1.0',
    compatibleWith: ['claude', 'codex'] as string[],
    tags: [type],
  }

  if (type === 'provider') {
    return {
      ...base,
      installHook: { steps: [{ type: 'config', patch: { apiKey: '', baseUrl: vals.baseUrl ?? '', authType: 'bearer', level: 1 } }] },
      metadata: {
        configSchema: { type: 'object', required: ['apiKey'], properties: { apiKey: { type: 'string' }, baseUrl: { type: 'string', default: vals.baseUrl ?? '' } } },
        supportedModels: (vals.supportedModels ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      },
    }
  }
  if (type === 'mcp') {
    if (vals.transport === 'stdio') {
      let env: Record<string, string> | undefined
      try { env = vals.env ? JSON.parse(vals.env) : undefined } catch { env = undefined }
      return { ...base, installHook: { steps: [] }, metadata: { transport: 'stdio', serverCommand: vals.command ?? '', ...(env ? { env } : {}) } }
    }
    let headers: Record<string, string> | undefined
    try { headers = vals.headers ? JSON.parse(vals.headers) : undefined } catch { headers = undefined }
    return { ...base, installHook: { steps: [] }, metadata: { transport: vals.transport ?? 'http', url: vals.url ?? '', ...(headers ? { headers } : {}) } }
  }

  // skill — fetch the raw SKILL.md into skill.md on install
  return {
    ...base,
    installHook: { steps: [{ type: 'file', url: vals.contentUrl ?? '', dest: 'skill.md' }] },
    metadata: { contentUrl: vals.contentUrl ?? '', source: { repo: vals.repo ?? '' } },
  }
}

export function PublishModal({ open, onOpenChange }: PublishModalProps) {
  const t = useTranslations('site.publish')
  const tc = useTranslations('store.category')
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
      // Open GitHub's prefilled "new file" page: the user's own browser session
      // forks the registry and opens a PR when they commit — no bot token needed.
      const sessRes = await fetch('/api/auth/get-session', { credentials: 'same-origin' })
      const sess = sessRes.ok
        ? ((await sessRes.json()) as { user?: { username?: string | null; name?: string } } | null)
        : null
      const username = sess?.user?.username || sess?.user?.name || 'community'
      const manifest = {
        $schema: '../schema/package.schema.json',
        ...buildManifest(type, vals),
        publisher: { slug: username, name: username, tier: 'community' },
      }
      const path = `${manifest.category}/${manifest.slug}.json`
      const value = encodeURIComponent(JSON.stringify(manifest, null, 2))
      const url = `${REGISTRY_URL}/new/main?filename=${encodeURIComponent(path)}&value=${value}`
      window.open(url, '_blank', 'noopener,noreferrer')
      setVals({})
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim" />
        <Dialog.Content className="plate fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-3rem)] w-[480px] max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 flex-col border border-ink bg-plate">
          <PlateMarks />
          <div className="px-6 pt-6 sm:px-8 sm:pt-7">
            <Dialog.Title className="text-[28px] leading-[1.1] tracking-[-0.02em]">{t('title')}</Dialog.Title>
            <Dialog.Description className="mt-3 text-sm leading-[22px] text-ink-2">{t('body')}</Dialog.Description>
          </div>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-col gap-5 overflow-y-auto px-6 pb-6 pt-5 sm:px-8">
              <fieldset>
                <legend className="label mb-1">{t('type')}</legend>
                <div className="flex gap-4 border-b border-line">
                  {TYPES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={type === value}
                      onClick={() => { setType(value); setVals({}) }}
                      className="-mb-px min-h-11 border-b-2 border-transparent px-1 text-[15px] text-ink-2 transition-colors hover:text-ink aria-pressed:border-ink aria-pressed:font-medium aria-pressed:text-ink"
                    >
                      {tc(value)}
                    </button>
                  ))}
                </div>
              </fieldset>

              {fields.map((field) => (
                <div key={field.key}>
                  <label htmlFor={`publish-${field.key}`} className="mb-1.5 block text-[13px] text-ink-2">
                    {t(`fields.${field.key}`)}
                  </label>
                  {field.type === 'select' ? (
                    <select
                      id={`publish-${field.key}`}
                      value={vals[field.key] ?? ''}
                      onChange={(e) => setVals((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      className="field"
                    >
                      <option value="" disabled>{t('choose')}</option>
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
                      className="field font-mono text-[13px]"
                    />
                  )}
                </div>
              ))}
            </div>

            {error && (
              <p role="alert" className="border-t border-line px-6 pt-3 text-sm text-danger sm:px-8">{error}</p>
            )}
            <div className="flex flex-col-reverse gap-2.5 border-t border-ink px-6 py-4 sm:flex-row sm:justify-end sm:px-8">
              <Dialog.Close className="btn min-h-12 px-5">{t('cancel')}</Dialog.Close>
              <button type="submit" disabled={busy} className="btn btn-primary">
                {busy ? t('submitting') : t('submit')}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
