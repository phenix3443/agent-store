import { useEffect, useRef, useState } from 'react'
import { Check, Eye, EyeOff } from 'lucide-react'
import type { ItemDetail, TargetStatus } from '@as/types'
import { callRpc, errorText } from '../../lib/rpc'
import { describeError } from '../../lib/errors'
import { AGENTS } from '../../lib/agents'
import type { InstalledRow } from '../../lib/useInstalled'
import { useAppState } from '../../state/AppState'
import { useTerminalLog } from '../../state/TerminalLog'
import { useT, type TFn } from '../../i18n'
import { Badge, KindLabel } from '../ui/badge'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Banner } from '../ui/states'
import { AgentList, AgentSwitch, DetailPane, ErrorDetails, FailureBanner, PaneHead, Section } from './parts'
import { DangerSection, VersionSection } from './common'
import type { TargetToggle } from './useTargetToggle'

export interface SchemaProperty {
  title?: string
  description?: string
  default?: unknown
  'x-env'?: string
  'x-bearer'?: boolean
  'x-secret'?: boolean
}

export interface ConfigSchema {
  properties?: Record<string, SchemaProperty>
  required?: string[]
}

export const upperSnake = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()

/** Required fields first, then the rest, each group by key. */
export function schemaFields(schema: ConfigSchema): [string, SchemaProperty][] {
  const required = schema.required ?? []
  return Object.entries(schema.properties ?? {}).sort(([a], [b]) => {
    const ra = required.includes(a)
    const rb = required.includes(b)
    return ra === rb ? a.localeCompare(b) : ra ? -1 : 1
  })
}

type Transport = Pick<ItemDetail, 'transport' | 'serverCommand' | 'url'>

export function transportText(d: Transport): string {
  return d.transport === 'stdio' || !d.transport ? (d.serverCommand ?? '') : (d.url ?? '')
}

export function transportShort(d: Transport, t: TFn): string {
  if (d.transport === 'sse') return t('tr.sse')
  if (d.transport === 'http') return t('tr.http')
  return d.serverCommand?.split(/\s+/)[0] || 'stdio'
}

export function transportLong(d: Transport, t: TFn): string {
  if (d.transport === 'sse') return t('tr.sseLong')
  if (d.transport === 'http') return t('tr.httpLong')
  return t('tr.local').replace('{0}', d.serverCommand?.split(/\s+/)[0] || 'stdio')
}

export function blockerText(s: TargetStatus | undefined, agentName: string, t: TFn): string | undefined {
  const b = s?.blocker
  if (!b) return undefined
  if (b.reason === 'incompatible') return t('errors.incompatible').replace('{tool}', agentName)
  if (b.reason === 'unsupported') return b.message.includes('SSE') ? t('errors.codexSse') : t('errors.codexHeaders')
  if (b.reason === 'needs-config') return t('mcp.fillFirst')
  if (b.reason === 'no-key') return t('prov.fillKey')
  return undefined
}

function toValues(current: Record<string, unknown> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(current ?? {}).map(([k, v]) => [k, v == null ? '' : String(v)]))
}

export function SecretInput({ id, value, onChange, placeholder, secret }: { id: string; value: string; onChange: (v: string) => void; placeholder: string; secret: boolean }) {
  const t = useT()
  const [shown, setShown] = useState(false)
  return (
    <div className="flex gap-1.5">
      <Input
        id={id}
        mono
        type={secret && !shown ? 'password' : 'text'}
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {secret && (
        <Button icon aria-pressed={shown} aria-label={t(shown ? 'mcp.hide' : 'mcp.show')} title={t(shown ? 'mcp.hide' : 'mcp.show')} onClick={() => setShown((v) => !v)}>
          {shown ? <EyeOff /> : <Eye />}
        </Button>
      )}
    </div>
  )
}

export function SavedMark({ saving, saved }: { saving: boolean; saved: boolean }) {
  const t = useT()
  if (saving) return <span className="font-sans text-[11.5px] text-fg-3">{t('cfg.autoSaving')}</span>
  if (!saved) return null
  return (
    <span className="flex items-center gap-1 font-sans text-[11.5px] text-provider">
      <Check size={12} /> {t('cfg.autoSaved')}
    </span>
  )
}

export function McpPane({
  row,
  toggle,
  onClose,
  onUninstall,
  onUpdate,
  updating,
}: {
  row: InstalledRow
  toggle: TargetToggle
  onClose: () => void
  onUninstall: () => void
  onUpdate: () => void
  updating: boolean
}) {
  const t = useT()
  const slug = row.slug
  const { installedVersion } = useAppState()
  const { appendLine } = useTerminalLog()
  const [status, setStatus] = useState<TargetStatus[]>(row.status ?? [])
  const [values, setValues] = useState<Record<string, string>>(toValues(row.currentConfig))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<{ message: string; detail?: string } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function refreshStatus() {
    setStatus(await callRpc<TargetStatus[]>('getTargetStatus', [slug]))
  }

  useEffect(() => {
    setValues(toValues(row.currentConfig))
    setSaved(false)
    setSaveError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  useEffect(() => {
    refreshStatus().catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, installedVersion])

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    },
    []
  )

  const schema = (row.configSchema ?? {}) as ConfigSchema
  const required = schema.required ?? []
  const fields = schemaFields(schema)

  function persist(next: Record<string, string>) {
    setValues(next)
    setSaving(true)
    setSaved(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const payload = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== ''))
      appendLine(`$ aas config ${slug}`)
      callRpc('setConfig', [slug, payload])
        .then(async () => {
          setSaved(true)
          setSaveError(null)
          await refreshStatus()
        })
        .catch((err) => {
          appendLine(`✗ ${errorText(err)}`, 'red')
          setSaveError(describeError(err, t))
        })
        .finally(() => setSaving(false))
    }, 500)
  }

  const failure = toggle.failure?.slug === slug ? toggle.failure : null
  const needsConfig = status.some((s) => s.compatible && s.blocker?.reason === 'needs-config')
  const noneEnabled = status.length > 0 && !status.some((s) => s.enabled)
  const warn = needsConfig ? t('mcp.warnCfg') : noneEnabled ? t('mcp.warnNone') : null

  return (
    <DetailPane label={slug} kind="mcp" status={<SavedMark saving={saving} saved={saved} />} onClose={onClose}>
      <PaneHead
        kind="mcp"
        title={row.name}
        by={
          <>
            <KindLabel kind="mcp">MCP</KindLabel>
            <Badge title={transportText(row)}>{transportShort(row, t)}</Badge>
            {row.publisher?.name}
          </>
        }
      />
      {(failure || saveError || warn) && (
        <div className="mt-3 flex flex-col gap-2">
          {failure && <FailureBanner failure={failure} onDismiss={toggle.dismiss} />}
          {saveError && (
            <Banner tone="error" title={t('policy.saveFailed')}>
              <p>{saveError.message}</p>
              <ErrorDetails detail={saveError.detail} />
            </Banner>
          )}
          {warn && <Banner tone="warn"><p className="text-fg">{warn}</p></Banner>}
        </div>
      )}

      <Section title={t('sec.agents')}>
        <AgentList
          lines={AGENTS.map((agent) => {
            const s = status.find((x) => x.target === agent.id)
            const on = s ? s.enabled : !!row.enabledFor[agent.id]
            const reason = blockerText(s, agent.name, t)
            return {
              agent,
              note: on ? `${agent.mcp} › ${agent.mcpKey}.${slug}` : (reason ?? t('st.off')),
              noteMono: on,
              right: (
                <AgentSwitch
                  kind="mcp"
                  agent={agent}
                  itemName={row.name}
                  checked={on}
                  reason={reason}
                  busy={toggle.busy === `${slug}:${agent.id}`}
                  onToggle={() => void toggle.toggle(slug, agent.id, on)}
                />
              ),
            }
          })}
        />
      </Section>

      <Section title={t('sec.config')}>
        {fields.length === 0 && <p className="text-[12.5px] text-fg-3">{t('mcp.noConfig')}</p>}
        {fields.map(([key, prop]) => {
          const id = `mcp-field-${key}`
          return (
            <div key={key} className="mb-3">
              <label htmlFor={id} className="mb-[5px] flex items-center gap-1.5 text-[11.5px] font-semibold text-fg-2">
                {prop.description ?? prop.title ?? key}
                {required.includes(key) && (
                  <span className="text-bad" aria-label={t('mcp.required')}>
                    *
                  </span>
                )}
              </label>
              <SecretInput
                id={id}
                secret={!!prop['x-secret']}
                value={values[key] ?? ''}
                onChange={(v) => persist({ ...values, [key]: v })}
                placeholder={prop.default != null ? String(prop.default) : (prop['x-env'] ?? upperSnake(key))}
              />
              {prop['x-bearer'] && (
                <p className="mt-1 text-[11.5px] text-fg-3">
                  {t('mcp.codexEnv')} <code className="font-mono text-[11px] text-fg-2">export {prop['x-env'] ?? upperSnake(key)}=…</code>
                </p>
              )}
            </div>
          )
        })}
      </Section>

      <Section title={t('f.transport')}>
        <div className="break-all rounded-[9px] border border-line bg-code px-[11px] py-[9px] font-mono text-xs">{transportText(row) || '—'}</div>
        <p className="mt-1.5 text-[11.5px] text-fg-3">{transportLong(row, t)}</p>
      </Section>

      <VersionSection row={row} onUpdate={onUpdate} updating={updating} />
      <DangerSection label={t('act.uninstall')} onClick={onUninstall} />
    </DetailPane>
  )
}
