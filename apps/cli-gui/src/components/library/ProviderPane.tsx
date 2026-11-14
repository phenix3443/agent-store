import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Copy, HelpCircle, Plus, X } from 'lucide-react'
import type { ItemDetail } from '@as/types'
import { callRpc, errorText } from '../../lib/rpc'
import { describeError } from '../../lib/errors'
import { AGENTS } from '../../lib/agents'
import { useAppState } from '../../state/AppState'
import { useTerminalLog } from '../../state/TerminalLog'
import { useT } from '../../i18n'
import { ProGate } from '../ProGate'
import { Badge, KindLabel } from '../ui/badge'
import { Button } from '../ui/button'
import { Input, Select } from '../ui/input'
import { Banner } from '../ui/states'
import { Switch } from '../ui/switch'
import { Tooltip } from '../ui/tooltip'
import { AgentList, AgentSwitch, DetailPane, ErrorDetails, FailureBanner, PaneHead, Section } from './parts'
import { DangerSection } from './common'
import { SavedMark, SecretInput } from './McpPane'
import type { TargetToggle } from './useTargetToggle'

export interface EditValues {
  name: string
  apiKey: string
  apiKeys: string[]
  baseUrl: string
  homepage: string
  endpointPath: string
  upstreamProtocol: string
  authType: 'bearer' | 'anthropic' | 'custom'
  customHeader: string
  icon: string
  level: string
  whitelist: string[]
  modelMapping: Array<{ from: string; to: string }>
  healthCheck: boolean
}

// '自动检测' and '默认' are the stored values for "unset"; existing configs carry them.
const UPSTREAM_PROTOCOLS = ['自动检测', 'openai_chat', 'claude_messages', 'codex_responses']
const ICONS = ['默认', 'anthropic', 'openai', 'google', 'adobe']
const LEVELS = Array.from({ length: 10 }, (_, i) => String(i + 1))
const LOCAL_DEFAULT_BASE_URL = 'http://127.0.0.1:18100'

export function toEditValues(current: Record<string, unknown> | undefined, fallbackName: string, isLocal = false): EditValues {
  const c = current ?? {}
  const rawAuthType = c['authType']
  const authType: EditValues['authType'] =
    rawAuthType === 'anthropic' ? 'anthropic' : rawAuthType && typeof rawAuthType === 'object' ? 'custom' : 'bearer'
  const customHeader = rawAuthType && typeof rawAuthType === 'object' ? String((rawAuthType as Record<string, unknown>)['header'] ?? '') : ''
  const mapping = c['modelMapping']
  const modelMapping =
    mapping && typeof mapping === 'object' ? Object.entries(mapping as Record<string, unknown>).map(([from, to]) => ({ from, to: String(to) })) : []
  return {
    name: String(c['name'] ?? (isLocal ? '默认' : fallbackName)),
    apiKey: String(c['apiKey'] ?? (isLocal ? 'built-in' : '')),
    apiKeys: Array.isArray(c['apiKeys']) ? (c['apiKeys'] as unknown[]).filter((k): k is string => typeof k === 'string') : [],
    baseUrl: String(c['baseUrl'] ?? (isLocal ? LOCAL_DEFAULT_BASE_URL : '')),
    homepage: String(c['homepage'] ?? ''),
    endpointPath: String(c['endpointPath'] ?? ''),
    upstreamProtocol: String(c['upstreamProtocol'] ?? '自动检测'),
    authType,
    customHeader,
    icon: String(c['icon'] ?? '默认'),
    level: String(c['level'] ?? '1'),
    whitelist: Array.isArray(c['whitelist']) ? (c['whitelist'] as string[]) : [],
    modelMapping,
    healthCheck: c['healthCheck'] === true,
  }
}

export function toConfigPayload(values: EditValues): Record<string, unknown> {
  return {
    name: values.name,
    apiKey: values.apiKey,
    apiKeys: values.apiKeys.map((k) => k.trim()).filter((k) => k !== ''),
    baseUrl: values.baseUrl,
    homepage: values.homepage,
    endpointPath: values.endpointPath,
    upstreamProtocol: values.upstreamProtocol,
    authType: values.authType === 'custom' ? { header: values.customHeader } : values.authType,
    icon: values.icon,
    level: Number(values.level),
    whitelist: values.whitelist,
    modelMapping: Object.fromEntries(values.modelMapping.map((m) => [m.from, m.to])),
    healthCheck: values.healthCheck,
  }
}

function Help({ text }: { text: string }) {
  return (
    <Tooltip label={text} side="top">
      <span tabIndex={0} aria-label={text} className="inline-flex cursor-help text-fg-3 hover:text-fg">
        <HelpCircle size={12} />
      </span>
    </Tooltip>
  )
}

function Field({ id, label, help, required, children, hint }: { id?: string; label: string; help?: string; required?: boolean; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 min-w-0">
      <label htmlFor={id} className="mb-[5px] flex items-center gap-1.5 text-[11.5px] font-semibold text-fg-2">
        {label}
        {required && <span className="text-bad">*</span>}
        {help && <Help text={help} />}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11.5px] text-fg-3">{hint}</p>}
    </div>
  )
}

function Fold({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <details className="group mt-4 rounded-box border border-line">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 text-[12.5px] font-semibold [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="text-fg-3 transition-transform group-open:rotate-90">
          ›
        </span>
        {title}
        <small className="truncate text-[11.5px] font-normal text-fg-3">{hint}</small>
      </summary>
      <div className="border-t border-line px-3.5 pb-1 pt-3.5">{children}</div>
    </details>
  )
}

export function ProviderPane({
  slug,
  toggle,
  onClose,
  onUninstall,
}: {
  slug: string
  toggle: TargetToggle
  onClose: () => void
  onUninstall: (detail: ItemDetail, name: string) => void
}) {
  const t = useT()
  const { installedVersion, setSelectedSlug, bumpInstalledVersion } = useAppState()
  const { appendLine } = useTerminalLog()
  const [detail, setDetail] = useState<ItemDetail | null>(null)
  const [loadError, setLoadError] = useState<{ message: string; detail?: string } | null>(null)
  const [values, setValues] = useState<EditValues>(toEditValues(undefined, slug))
  const [wlDraft, setWlDraft] = useState('')
  const [mapFrom, setMapFrom] = useState('')
  const [mapTo, setMapTo] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<{ message: string; detail?: string } | null>(null)
  const apiKeyRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadedSlug = useRef<string | null>(null)

  useEffect(() => {
    callRpc<ItemDetail>('info', [slug]).then(
      (d) => {
        setDetail(d)
        setLoadError(null)
        // Re-reads after a toggle keep what is being typed.
        if (loadedSlug.current !== slug) setValues(toEditValues(d.currentConfig, slug, (d.parentSlug ?? slug) === 'local'))
        loadedSlug.current = slug
      },
      (err) => setLoadError(describeError(err, t))
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, installedVersion])

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    },
    []
  )

  function persist(next: EditValues) {
    setValues(next)
    setSaving(true)
    setSaved(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      callRpc('setConfig', [slug, toConfigPayload(next)]).then(
        () => {
          setSaving(false)
          setSaved(true)
          setSaveError(null)
        },
        (err) => {
          setSaving(false)
          appendLine(`✗ ${errorText(err)}`, 'red')
          setSaveError(describeError(err, t))
        }
      )
    }, 500)
  }

  async function onToggle(target: (typeof AGENTS)[number]['id'], on: boolean) {
    const failed = await toggle.toggle(slug, target, on)
    if (failed?.focus === 'apiKey') apiKeyRef.current?.querySelector('input')?.focus()
  }

  async function duplicate() {
    appendLine(`$ aas duplicate ${slug}`)
    try {
      const { newSlug } = await callRpc<{ newSlug: string }>('duplicateProvider', [slug])
      appendLine(`✓ ${t('lib.childAdded')} ${newSlug}`, 'green')
      setSelectedSlug(newSlug)
    } catch (err) {
      appendLine(`✗ ${errorText(err)}`, 'red')
    }
    bumpInstalledVersion()
  }

  const isLocal = (detail?.parentSlug ?? slug) === 'local'
  const enabledFor = detail?.enabledFor ?? {}
  const noTargets = !AGENTS.some((a) => enabledFor[a.id])
  const noKey = !isLocal && values.apiKey.trim() === ''
  const warn = detail && (noKey ? t('prov.warnKey') : noTargets ? t('prov.warnNone') : null)
  const failure = toggle.failure?.slug === slug ? toggle.failure : null
  const providerName = String(detail?.currentConfig?.['provider'] ?? detail?.name ?? slug)

  return (
    <DetailPane label={slug} kind="provider" status={<SavedMark saving={saving} saved={saved} />} onClose={onClose}>
      <PaneHead
        kind="provider"
        title={isLocal ? t('relay.title') : values.name || slug}
        by={
          <>
            <KindLabel kind="provider">{t('categories.provider')}</KindLabel>
            {isLocal ? t('prov.builtin') : <><Badge className="font-mono">L{values.level}</Badge>{providerName}</>}
          </>
        }
      />
      {isLocal && <p className="mt-3 text-fg-2">{t('prov.localD')}</p>}
      {(failure || saveError || loadError || warn) && (
        <div className="mt-3 flex flex-col gap-2">
          {loadError && (
            <Banner tone="error" title={t('lib.loadFailed')}>
              <p>{loadError.message}</p>
              <ErrorDetails detail={loadError.detail} />
            </Banner>
          )}
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

      <Section title={<>{t(isLocal ? 'prov.wiring' : 'sec.agents')}<Help text={t('cfg.helpTargets')} /></>}>
        <AgentList
          lines={AGENTS.map((agent) => {
            const on = !!enabledFor[agent.id]
            const incompatible = !!detail && !detail.compatibleWith.includes(agent.id)
            const reason = incompatible ? t('errors.incompatible').replace('{tool}', agent.name) : undefined
            return {
              agent,
              note: on ? (isLocal ? t('prov.wired').replace('{0}', agent.name) : t('prov.via')) : (reason ?? (noKey ? t('prov.fillKey') : t('st.off'))),
              right: (
                <AgentSwitch
                  kind="provider"
                  agent={agent}
                  itemName={values.name || slug}
                  checked={on}
                  reason={reason}
                  busy={toggle.busy === `${slug}:${agent.id}`}
                  onToggle={() => void onToggle(agent.id, on)}
                />
              ),
            }
          })}
        />
      </Section>

      {isLocal ? (
        <Section title={t('prov.listen')}>
          <Input id="provider-baseUrl" mono aria-label={t('prov.listen')} value={values.baseUrl} placeholder={LOCAL_DEFAULT_BASE_URL} onChange={(e) => persist({ ...values, baseUrl: e.target.value })} />
          <p className="mt-1 text-[11.5px] text-fg-3">{t('cfg.helpLocalBaseUrl')}</p>
        </Section>
      ) : (
        <>
          <Section title={t('sec.config')}>
            <Field id="cli-config-name" label={t('prov.cfgName')} hint={values.name.trim() === '' ? <span className="text-bad">{t('cfg.nameRequired')}</span> : undefined}>
              <Input id="cli-config-name" invalid={values.name.trim() === ''} value={values.name} placeholder={t('cfg.namePlaceholder')} onChange={(e) => persist({ ...values, name: e.target.value })} />
            </Field>
            <Field id="provider-apiKey" label={t('cfg.apiKey')} required>
              <div ref={apiKeyRef}>
                <SecretInput id="provider-apiKey" secret value={values.apiKey} placeholder="sk-…" onChange={(v) => persist({ ...values, apiKey: v })} />
              </div>
            </Field>
          </Section>

          <Section title={<>{t('prov.keys')}<Badge tone="pro">Pro</Badge></>}>
            <ProGate feature="keyRotation" title={t('pro.keyRotation.title')} description={t('pro.keyRotation.desc')}>
              <div className="flex flex-col gap-1.5">
                {values.apiKeys.map((k, i) => (
                  <div key={i} className="flex gap-1.5">
                    <Input
                      mono
                      type="password"
                      aria-label={`${t('prov.keys')} ${i + 1}`}
                      value={k}
                      placeholder="sk-…"
                      onChange={(e) => persist({ ...values, apiKeys: values.apiKeys.map((x, j) => (j === i ? e.target.value : x)) })}
                    />
                    <Button icon aria-label={t('prov.remove')} onClick={() => persist({ ...values, apiKeys: values.apiKeys.filter((_, j) => j !== i) })}>
                      <X />
                    </Button>
                  </div>
                ))}
                <div>
                  <Button size="sm" onClick={() => persist({ ...values, apiKeys: [...values.apiKeys, ''] })}>
                    <Plus />
                    {t('prov.addKey')}
                  </Button>
                </div>
              </div>
            </ProGate>
          </Section>

          <Fold title={t('cfg.moreSettings')} hint={t('cfg.moreSettingsHint')}>
            <Field label={`${t('cfg.providerName')}${t('cfg.readonly')}`}>
              <div title={t('cfg.readonlyTip')} className="break-all rounded-[9px] border border-line bg-code px-[11px] py-2 font-mono text-xs text-fg-2">
                {providerName}
              </div>
            </Field>
            <Field id="provider-baseUrl" label={t('cfg.apiUrl')} help={t('cfg.helpBaseUrl')}>
              <Input id="provider-baseUrl" mono value={values.baseUrl} placeholder="https://api.anthropic.com" onChange={(e) => persist({ ...values, baseUrl: e.target.value })} />
            </Field>
            <Field id="provider-homepage" label={t('cfg.homepage')}>
              <Input id="provider-homepage" mono value={values.homepage} placeholder="https://docs.example.com" onChange={(e) => persist({ ...values, homepage: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-x-3">
              <Field id="provider-endpoint" label={t('cfg.apiEndpoint')} help={t('cfg.helpEndpoint')}>
                <Input id="provider-endpoint" mono value={values.endpointPath} placeholder={t('cfg.endpointPlaceholder')} onChange={(e) => persist({ ...values, endpointPath: e.target.value })} />
              </Field>
              <Field id="provider-protocol" label={t('cfg.upstreamProtocol')} help={t('cfg.helpUpstreamProtocol')}>
                <Select id="provider-protocol" value={values.upstreamProtocol} onChange={(e) => persist({ ...values, upstreamProtocol: e.target.value })}>
                  {UPSTREAM_PROTOCOLS.map((p) => (
                    <option key={p} value={p}>
                      {p === '自动检测' ? t('cfg.autoDetect') : p}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="provider-auth" label={t('cfg.authType')} help={t('cfg.helpAuthType')}>
                <Select id="provider-auth" value={values.authType} onChange={(e) => persist({ ...values, authType: e.target.value as EditValues['authType'] })}>
                  <option value="bearer">Bearer</option>
                  <option value="anthropic">X-API-Key</option>
                  <option value="custom">{t('cfg.custom')}</option>
                </Select>
              </Field>
              <Field id="provider-level" label={t('cfg.priorityGroup')} help={t('cfg.helpLevel')}>
                <Select id="provider-level" value={values.level} onChange={(e) => persist({ ...values, level: e.target.value })}>
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      Level {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="provider-header" label={t('cfg.customHeaderLabel')}>
                <Input id="provider-header" mono value={values.customHeader} placeholder={t('cfg.customHeaderPlaceholder')} onChange={(e) => persist({ ...values, customHeader: e.target.value })} />
              </Field>
              <Field id="provider-icon" label={t('cfg.icon')}>
                <Select id="provider-icon" value={values.icon} onChange={(e) => persist({ ...values, icon: e.target.value })}>
                  {ICONS.map((i) => (
                    <option key={i} value={i}>
                      {i === '默认' ? t('cfg.default') : i}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Fold>

          <Fold title={t('cfg.advancedSettings')} hint={t('prov.advD')}>
            <Field id="provider-wl" label={t('cfg.whitelist')}>
              {values.whitelist.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {values.whitelist.map((w, i) => (
                    <Badge key={`${w}-${i}`} className="font-mono">
                      {w}
                      <button type="button" aria-label={`${t('prov.remove')} ${w}`} className="-mr-1 text-fg-3 hover:text-fg" onClick={() => persist({ ...values, whitelist: values.whitelist.filter((_, j) => j !== i) })}>
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-1.5">
                <Input id="provider-wl" mono value={wlDraft} placeholder={t('cfg.whitelistPlaceholder')} onChange={(e) => setWlDraft(e.target.value)} />
                <Button
                  onClick={() => {
                    if (!wlDraft.trim()) return
                    persist({ ...values, whitelist: [...values.whitelist, wlDraft.trim()] })
                    setWlDraft('')
                  }}
                >
                  {t('cfg.add')}
                </Button>
              </div>
            </Field>
            <Field label={t('cfg.modelMapping')}>
              {values.modelMapping.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {values.modelMapping.map((m, i) => (
                    <Badge key={`${m.from}-${i}`} className="font-mono">
                      {m.from} → {m.to}
                      <button type="button" aria-label={`${t('prov.remove')} ${m.from}`} className="-mr-1 text-fg-3 hover:text-fg" onClick={() => persist({ ...values, modelMapping: values.modelMapping.filter((_, j) => j !== i) })}>
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-1.5">
                <Input mono aria-label={t('cfg.mapFromPlaceholder')} value={mapFrom} placeholder={t('cfg.mapFromPlaceholder')} onChange={(e) => setMapFrom(e.target.value)} />
                <Input mono aria-label={t('cfg.mapToPlaceholder')} value={mapTo} placeholder={t('cfg.mapToPlaceholder')} onChange={(e) => setMapTo(e.target.value)} />
                <Button
                  onClick={() => {
                    if (!mapFrom.trim() || !mapTo.trim()) return
                    persist({ ...values, modelMapping: [...values.modelMapping, { from: mapFrom, to: mapTo }] })
                    setMapFrom('')
                    setMapTo('')
                  }}
                >
                  {t('cfg.addMapping')}
                </Button>
              </div>
            </Field>
            <div className="flex items-center gap-2.5 pb-3">
              <div className="min-w-0 flex-1">
                <b className="text-[13px] font-semibold">{t('cfg.healthCheck')}</b>
                <small className="block text-[11.5px] text-fg-3">{t('cfg.healthCheckHint')}</small>
              </div>
              <Switch kind="provider" aria-label={t('cfg.healthCheck')} checked={values.healthCheck} onCheckedChange={(v) => persist({ ...values, healthCheck: v })} />
            </div>
          </Fold>

          {detail && (
            <DangerSection
              label={t('act.deleteCfg')}
              onClick={() => onUninstall(detail, values.name || slug)}
              extra={
                <Button onClick={() => void duplicate()}>
                  <Copy />
                  {t('prov.dup')}
                </Button>
              }
            />
          )}
        </>
      )}
    </DetailPane>
  )
}
