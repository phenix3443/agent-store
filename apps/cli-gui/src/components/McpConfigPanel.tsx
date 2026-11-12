import { useEffect, useRef, useState } from 'react'
import type { ItemDetail, TargetStatus, ToolTarget } from '@as/types'
import { Check } from 'lucide-react'
import { callRpc } from '../lib/rpc'
import { useT } from '../i18n'
import { Banners, TargetPicker, TARGET_LABEL, type PanelError } from './ConfigParts'
import { describeError } from '../lib/errors'

interface SchemaProperty {
  title?: string
  description?: string
  default?: unknown
  'x-env'?: string
  'x-bearer'?: boolean
  'x-secret'?: boolean
}

const upperSnake = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()

function toValues(current: Record<string, unknown> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(current ?? {}).map(([k, v]) => [k, v == null ? '' : String(v)]))
}

export function McpConfigPanel({ slug, onClose }: { slug: string; onClose: () => void }) {
  const t = useT()
  const [detail, setDetail] = useState<ItemDetail | null>(null)
  const [status, setStatus] = useState<TargetStatus[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [error, setError] = useState<PanelError | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function refreshStatus() {
    setStatus(await callRpc<TargetStatus[]>('getTargetStatus', [slug]))
  }

  useEffect(() => {
    Promise.all([callRpc<ItemDetail>('info', [slug]), callRpc<TargetStatus[]>('getTargetStatus', [slug])]).then(
      ([d, s]) => {
        setDetail(d)
        setStatus(s)
        setValues(toValues(d.currentConfig))
      },
      (err) => setError(describeError(err, t))
    )
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [slug])

  const schema = (detail?.configSchema ?? {}) as { properties?: Record<string, SchemaProperty>; required?: string[] }
  const required = schema.required ?? []
  const fields = Object.entries(schema.properties ?? {}).sort(([a], [b]) => {
    const ra = required.includes(a)
    const rb = required.includes(b)
    return ra === rb ? a.localeCompare(b) : ra ? -1 : 1
  })

  function persist(next: Record<string, string>) {
    setValues(next)
    setSaving(true)
    setSaved(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const payload = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== ''))
      callRpc('setConfig', [slug, payload])
        .then(async () => {
          setSaved(true)
          setError(null)
          await refreshStatus()
        })
        .catch((err) => setError({ lead: t('policy.saveFailed'), ...describeError(err, t) }))
        .finally(() => setSaving(false))
    }, 500)
  }

  async function toggle(target: ToolTarget) {
    const enabled = status.find((s) => s.target === target)?.enabled ?? false
    setToggling(true)
    try {
      await callRpc(enabled ? 'disable' : 'enable', [slug, target])
      setError(null)
    } catch (err) {
      setError({ lead: t(enabled ? 'policy.disableFailed' : 'policy.enableFailed').replace('{tool}', TARGET_LABEL[target]), ...describeError(err, t) })
    } finally {
      await refreshStatus().catch(() => undefined)
      setToggling(false)
    }
  }

  const compatible = status.filter((s) => s.compatible)
  const needsConfig = compatible.some((s) => s.blocker?.reason === 'needs-config')
  const noneEnabled = status.length > 0 && !status.some((s) => s.enabled)
  const warnText = needsConfig ? t('policy.warnNeedsConfig') : noneEnabled ? t('policy.warnNoTargets') : null

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-start gap-3.5 border-b border-store-border bg-store-content px-7 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate pb-1 font-mono text-lg font-bold text-store-text">{detail?.name ?? slug}</h2>
          <p className="text-[11px] text-store-text-3">MCP · {slug}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pt-1 text-[11.5px] text-store-text-3">
          {saving && <span>{t('cfg.autoSaving')}</span>}
          {!saving && saved && (
            <span className="flex items-center gap-1 text-store-green">
              <Check size={13} /> {t('cfg.autoSaved')}
            </span>
          )}
        </div>
        <button type="button" aria-label={t('window.close')} onClick={onClose} className="shrink-0 text-store-text-2 hover:text-store-text">
          ×
        </button>
      </div>

      <Banners error={error} warn={warnText} />

      <div className={`grid max-w-[620px] grid-cols-2 items-start gap-x-5 gap-y-3.5 px-7 ${error || warnText ? '' : 'mt-3.5'}`}>
        <div className="col-span-2">
          <p className="mb-1.5 text-[11px] font-semibold text-store-text-2">{t('cfg.applicableClients')}</p>
          <TargetPicker
            options={status.map((s) => ({
              target: s.target,
              enabled: s.enabled,
              disabledReason:
                s.blocker?.reason === 'incompatible'
                  ? t('policy.unsupported')
                  : s.blocker?.reason === 'unsupported'
                    ? (s.blocker.message.includes('SSE') ? t('errors.codexSse') : t('errors.codexHeaders'))
                  : s.blocker?.reason === 'needs-config'
                    ? t('policy.fillFirst')
                    : undefined,
            }))}
            busy={toggling}
            onToggle={toggle}
          />
        </div>

        {detail && fields.length === 0 && (
          <p className="col-span-2 text-xs text-store-text-3">{t('policy.noConfig')}</p>
        )}

        {fields.map(([key, prop]) => {
          const id = `mcp-field-${key}`
          return (
            <div key={key} className="col-span-2">
              <label htmlFor={id} className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-store-text-2">
                {prop.description ?? prop.title ?? key}
                {required.includes(key) && <span className="text-store-red">*</span>}
              </label>
              <input
                id={id}
                type={prop['x-secret'] ? 'password' : 'text'}
                autoComplete="off"
                value={values[key] ?? ''}
                onChange={(e) => persist({ ...values, [key]: e.target.value })}
                placeholder={prop.default != null ? String(prop.default) : (prop['x-env'] ?? upperSnake(key))}
                className="w-full rounded-lg border border-store-border-strong bg-store-panel px-3 py-2 font-mono text-xs text-store-text outline-none focus:border-store-accent"
              />
              {prop['x-bearer'] && (
                <p className="mt-1 text-[10.5px] text-store-text-3">
                  {t('policy.codexEnv')} <code className="font-mono">export {prop['x-env'] ?? upperSnake(key)}=…</code>
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
