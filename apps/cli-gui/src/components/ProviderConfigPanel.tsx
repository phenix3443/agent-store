import { useEffect, useRef, useState } from 'react'
import type { ItemDetail, ToolTarget } from '@as/types'
import { Check, HelpCircle } from 'lucide-react'
import { callRpc } from '../lib/rpc'
import { ProGate } from './ProGate'
import { useT } from '../i18n'

function MultiKeyEditor({ keys, onChange }: { keys: string[]; onChange: (keys: string[]) => void }) {
  const t = useT()
  return (
    <div className="flex flex-col gap-2 p-1">
      <p className="text-[11px] font-semibold text-store-text-2">{t('cfg.multiKeyTitle')}</p>
      {keys.map((k, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={k}
            onChange={(e) => onChange(keys.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder="sk-..."
            className="w-full rounded-lg border border-store-border-strong bg-store-panel px-3 py-2 font-mono text-xs text-store-text outline-none focus:border-store-accent"
          />
          <button
            type="button"
            onClick={() => onChange(keys.filter((_, j) => j !== i))}
            className="shrink-0 rounded-lg border border-store-border-strong px-2.5 text-xs text-store-text-2 hover:border-store-red hover:text-store-red"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...keys, ''])}
        className="self-start rounded-lg border border-dashed border-store-border-strong px-3 py-1.5 text-xs text-store-text-2 hover:border-store-accent hover:text-store-accent"
      >
        {t('cfg.addKey')}
      </button>
    </div>
  )
}

interface ProviderConfigPanelProps {
  slug: string
  onClose: () => void
}

interface EditValues {
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

const UPSTREAM_PROTOCOLS = ['自动检测', 'openai_chat', 'claude_messages', 'codex_responses']
const ICONS = ['默认', 'anthropic', 'openai', 'google', 'adobe']
const LEVELS = Array.from({ length: 10 }, (_, i) => String(i + 1))

const LOCAL_DEFAULT_BASE_URL = 'http://127.0.0.1:18100'

function toEditValues(
  current: Record<string, unknown> | undefined,
  fallbackName: string,
  isLocal = false
): EditValues {
  const c = current ?? {}
  const rawAuthType = c['authType']
  const authType: EditValues['authType'] =
    rawAuthType === 'anthropic' ? 'anthropic' : rawAuthType && typeof rawAuthType === 'object' ? 'custom' : 'bearer'
  const customHeader =
    rawAuthType && typeof rawAuthType === 'object' ? String((rawAuthType as Record<string, unknown>)['header'] ?? '') : ''
  const mapping = c['modelMapping']
  const modelMapping =
    mapping && typeof mapping === 'object'
      ? Object.entries(mapping as Record<string, unknown>).map(([from, to]) => ({ from, to: String(to) }))
      : []
  const whitelist = Array.isArray(c['whitelist']) ? (c['whitelist'] as string[]) : []

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
    whitelist,
    modelMapping,
    healthCheck: c['healthCheck'] === true,
  }
}

function toConfigPayload(values: EditValues): Record<string, unknown> {
  const authType = values.authType === 'custom' ? { header: values.customHeader } : values.authType

  const apiKeys = values.apiKeys.map((k) => k.trim()).filter((k) => k !== '')

  return {
    name: values.name,
    apiKey: values.apiKey,
    apiKeys,
    baseUrl: values.baseUrl,
    homepage: values.homepage,
    endpointPath: values.endpointPath,
    upstreamProtocol: values.upstreamProtocol,
    authType,
    icon: values.icon,
    level: Number(values.level),
    whitelist: values.whitelist,
    modelMapping: Object.fromEntries(values.modelMapping.map((m) => [m.from, m.to])),
    healthCheck: values.healthCheck,
  }
}

export function ProviderConfigPanel({ slug, onClose }: ProviderConfigPanelProps) {
  const t = useT()
  const [providerName, setProviderName] = useState(slug)
  const [rootSlug, setRootSlug] = useState(slug)
  const [targets, setTargets] = useState<Partial<Record<ToolTarget, boolean>>>({})
  const [values, setValues] = useState<EditValues>(toEditValues(undefined, slug))
  const [moreOpen, setMoreOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [wlDraft, setWlDraft] = useState('')
  const [mapFromDraft, setMapFromDraft] = useState('')
  const [mapToDraft, setMapToDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [helpTip, setHelpTip] = useState<{ text: string; x: number; y: number } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    callRpc<ItemDetail>('info', [slug]).then((detail) => {
      const root = detail.parentSlug ?? slug
      setRootSlug(root)
      setTargets(detail.enabledFor)
      setProviderName(String(detail.currentConfig?.['provider'] ?? detail.name ?? slug))
      setValues(toEditValues(detail.currentConfig, slug, root === 'local'))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  function persist(next: EditValues) {
    setValues(next)
    setSaving(true)
    setSaved(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void callRpc('setConfig', [slug, toConfigPayload(next)]).then(() => {
        setSaving(false)
        setSaved(true)
      })
    }, 500)
  }

  async function toggleTarget(target: ToolTarget) {
    const isEnabled = !!targets[target]
    await callRpc(isEnabled ? 'disable' : 'enable', [slug, target])
    setTargets((prev) => ({ ...prev, [target]: !isEnabled }))
  }

  function addWhitelist() {
    const trimmed = wlDraft.trim()
    if (!trimmed) return
    persist({ ...values, whitelist: [...values.whitelist, trimmed] })
    setWlDraft('')
  }

  function removeWhitelist(index: number) {
    persist({ ...values, whitelist: values.whitelist.filter((_, i) => i !== index) })
  }

  function addMapping() {
    if (!mapFromDraft.trim() || !mapToDraft.trim()) return
    persist({ ...values, modelMapping: [...values.modelMapping, { from: mapFromDraft, to: mapToDraft }] })
    setMapFromDraft('')
    setMapToDraft('')
  }

  function removeMapping(index: number) {
    persist({ ...values, modelMapping: values.modelMapping.filter((_, i) => i !== index) })
  }

  function showHelp(e: React.MouseEvent<HTMLElement>, text: string) {
    const r = e.currentTarget.getBoundingClientRect()
    setHelpTip({ text, x: Math.round(r.left + r.width / 2), y: Math.round(r.bottom + 6) })
  }

  const isLocal = rootSlug === 'local'
  const nameEmpty = values.name.trim() === ''
  const noTargets = !targets.claude && !targets.codex
  const noApiKey = values.apiKey.trim() === ''
  const showWarn = noTargets || (!isLocal && noApiKey)
  const warnText = noTargets ? t('cfg.warnNoTargets') : t('cfg.warnNoApiKey')

  const HELP = {
    targets: t('cfg.helpTargets'),
    baseUrl: t('cfg.helpBaseUrl'),
    endpointPath: t('cfg.helpEndpoint'),
    upstreamProtocol: t('cfg.helpUpstreamProtocol'),
    authType: t('cfg.helpAuthType'),
    level: t('cfg.helpLevel'),
    localBaseUrl: t('cfg.helpLocalBaseUrl'),
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-start gap-3.5 border-b border-store-border bg-store-content px-7 py-4">
        <div className="min-w-0 flex-1">
          <input
            id="cli-config-name"
            value={values.name}
            onChange={(e) => persist({ ...values, name: e.target.value })}
            placeholder={t('cfg.namePlaceholder')}
            className={`w-full border-b bg-transparent pb-1 font-mono text-lg font-bold text-store-text outline-none focus:border-store-border-strong ${
              nameEmpty ? 'border-store-red' : 'border-transparent'
            }`}
          />
          {nameEmpty && <p className="mt-1 text-[11px] text-store-red">{t('cfg.nameRequired')}</p>}
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

      {showWarn && (
        <div className="mx-7 mb-3.5 mt-3.5 flex items-center gap-2 rounded-lg border border-store-amber bg-store-amber-soft px-3.5 py-2.5">
          <span className="text-store-amber">⚠</span>
          <span className="text-[11.5px] text-store-text-2">{warnText}</span>
        </div>
      )}

      <div className="grid max-w-[620px] grid-cols-2 items-start gap-x-5 gap-y-3.5 px-7">
        <div className="col-span-2">
          <label className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-store-text-2">
            {t('cfg.applicableClients')} <span className="text-store-red">*</span>
            <HelpIcon text={HELP.targets} onShow={showHelp} onHide={() => setHelpTip(null)} />
          </label>
          <div className="flex gap-2">
            {(['claude', 'codex'] as const).map((target) => (
              <button
                key={target}
                type="button"
                aria-label={target === 'claude' ? 'Claude Code' : 'Codex'}
                aria-pressed={!!targets[target]}
                onClick={() => toggleTarget(target)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                  targets[target] ? 'border-store-accent bg-store-accent-soft text-store-accent' : 'border-store-border text-store-text-2'
                }`}
              >
                {target === 'claude' ? 'Claude Code' : 'Codex'}
              </button>
            ))}
          </div>
        </div>

        {isLocal ? (
          <div className="col-span-2">
            <label htmlFor="provider-baseUrl" className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-store-text-2">
              {t('cfg.apiUrl')}
              <HelpIcon text={HELP.localBaseUrl} onShow={showHelp} onHide={() => setHelpTip(null)} />
            </label>
            <input
              id="provider-baseUrl"
              value={values.baseUrl}
              onChange={(e) => persist({ ...values, baseUrl: e.target.value })}
              placeholder="http://127.0.0.1:18100"
              className="w-full rounded-lg border border-store-border-strong bg-store-panel px-3 py-2 font-mono text-xs text-store-text outline-none focus:border-store-accent"
            />
          </div>
        ) : (
          <div className="col-span-2">
            <label htmlFor="provider-apiKey" className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-store-text-2">
              {t('cfg.apiKey')} <span className="text-store-red">*</span>
            </label>
            <input
              id="provider-apiKey"
              value={values.apiKey}
              onChange={(e) => persist({ ...values, apiKey: e.target.value })}
              placeholder="sk-..."
              className="w-full rounded-lg border border-store-border-strong bg-store-panel px-3 py-2 font-mono text-xs text-store-text outline-none focus:border-store-accent"
            />
          </div>
        )}
      </div>

      {!isLocal && (
        <div className="mx-7 mt-4 max-w-[620px]">
          <ProGate
            feature="keyRotation"
            title={t('pro.keyRotation.title')}
            description={t('pro.keyRotation.desc')}
          >
            <MultiKeyEditor keys={values.apiKeys} onChange={(apiKeys) => persist({ ...values, apiKeys })} />
          </ProGate>
        </div>
      )}

      <div className="mx-7 mt-4 max-w-[620px] overflow-hidden rounded-xl border border-store-border">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3.5 py-3 text-left"
        >
          <span aria-hidden="true" className="text-xs text-store-text-3">{moreOpen ? '▾' : '▸'}</span>
          <span className="text-[12.5px] font-semibold text-store-text">{t('cfg.moreSettings')}</span>
          <span className="text-[10.5px] text-store-text-3">{t('cfg.moreSettingsHint')}</span>
        </button>
        {moreOpen && (
          <div className="grid grid-cols-2 items-start gap-x-5 gap-y-3.5 border-t border-store-border p-3.5">
            <div>
              <label className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-store-text-2">
                {t('cfg.providerName')} <span className="cursor-help text-[10px] font-medium text-store-text-3" title={t('cfg.readonlyTip')}>{t('cfg.readonly')}</span>
              </label>
              <div className="w-full rounded-lg border border-store-border bg-store-panel-2 px-3 py-2 font-mono text-xs text-store-text-2">
                {providerName}
              </div>
            </div>
            {!isLocal && (
              <div>
                <label className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-store-text-2">
                  {t('cfg.apiUrl')}
                  <HelpIcon text={HELP.baseUrl} onShow={showHelp} onHide={() => setHelpTip(null)} />
                </label>
                <input
                  value={values.baseUrl}
                  onChange={(e) => persist({ ...values, baseUrl: e.target.value })}
                  placeholder="https://api.anthropic.com"
                  className="w-full rounded-lg border border-store-border-strong bg-store-panel px-3 py-2 font-mono text-xs text-store-text outline-none focus:border-store-accent"
                />
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold text-store-text-2">{t('cfg.homepage')}</label>
              <input
                value={values.homepage}
                onChange={(e) => persist({ ...values, homepage: e.target.value })}
                placeholder="https://docs.example.com"
                className="w-full rounded-lg border border-store-border-strong bg-store-panel px-3 py-2 font-mono text-xs text-store-text outline-none focus:border-store-accent"
              />
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-store-text-2">
                {t('cfg.apiEndpoint')}
                <HelpIcon text={HELP.endpointPath} onShow={showHelp} onHide={() => setHelpTip(null)} />
              </label>
              <input
                value={values.endpointPath}
                onChange={(e) => persist({ ...values, endpointPath: e.target.value })}
                placeholder={t('cfg.endpointPlaceholder')}
                className="w-full rounded-lg border border-store-border-strong bg-store-panel px-3 py-2 font-mono text-xs text-store-text outline-none focus:border-store-accent"
              />
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-store-text-2">
                {t('cfg.upstreamProtocol')}
                <HelpIcon text={HELP.upstreamProtocol} onShow={showHelp} onHide={() => setHelpTip(null)} />
              </label>
              <select
                value={values.upstreamProtocol}
                onChange={(e) => persist({ ...values, upstreamProtocol: e.target.value })}
                className="w-full rounded-lg border border-store-border-strong bg-store-panel px-3 py-2 font-mono text-xs text-store-text outline-none focus:border-store-accent"
              >
                {UPSTREAM_PROTOCOLS.map((p) => (
                  <option key={p} value={p}>{p === '自动检测' ? t('cfg.autoDetect') : p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-store-text-2">
                {t('cfg.authType')}
                <HelpIcon text={HELP.authType} onShow={showHelp} onHide={() => setHelpTip(null)} />
              </label>
              <select
                value={values.authType}
                onChange={(e) => persist({ ...values, authType: e.target.value as EditValues['authType'] })}
                className="w-full rounded-lg border border-store-border-strong bg-store-panel px-3 py-2 font-mono text-xs text-store-text outline-none focus:border-store-accent"
              >
                <option value="bearer">Bearer</option>
                <option value="anthropic">X-API-Key</option>
                <option value="custom">{t('cfg.custom')}</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold text-store-text-2">{t('cfg.customHeaderLabel')}</label>
              <input
                value={values.customHeader}
                onChange={(e) => persist({ ...values, customHeader: e.target.value })}
                placeholder={t('cfg.customHeaderPlaceholder')}
                className="w-full rounded-lg border border-store-border-strong bg-store-panel px-3 py-2 font-mono text-xs text-store-text outline-none focus:border-store-accent"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold text-store-text-2">{t('cfg.icon')}</label>
              <select
                value={values.icon}
                onChange={(e) => persist({ ...values, icon: e.target.value })}
                className="w-full rounded-lg border border-store-border-strong bg-store-panel px-3 py-2 font-mono text-xs text-store-text outline-none focus:border-store-accent"
              >
                {ICONS.map((i) => (
                  <option key={i} value={i}>{i === '默认' ? t('cfg.default') : i}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-store-text-2">
                {t('cfg.priorityGroup')}
                <HelpIcon text={HELP.level} onShow={showHelp} onHide={() => setHelpTip(null)} />
              </label>
              <select
                value={values.level}
                onChange={(e) => persist({ ...values, level: e.target.value })}
                className="w-full rounded-lg border border-store-border-strong bg-store-panel px-3 py-2 font-mono text-xs text-store-text outline-none focus:border-store-accent"
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="mx-7 my-4 max-w-[620px] overflow-hidden rounded-xl border border-store-border">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3.5 py-3 text-left"
        >
          <span aria-hidden="true" className="text-xs text-store-text-3">{advancedOpen ? '▾' : '▸'}</span>
          <span className="text-[12.5px] font-semibold text-store-text">{t('cfg.advancedSettings')}</span>
          <span className="text-[10.5px] text-store-text-3">{t('cfg.advancedHint')}</span>
        </button>
        {advancedOpen && (
          <div className="flex flex-col gap-4 border-t border-store-border p-3.5">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-store-text-2">{t('cfg.whitelist')}</p>
              <div className="flex gap-2">
                <input
                  value={wlDraft}
                  onChange={(e) => setWlDraft(e.target.value)}
                  placeholder={t('cfg.whitelistPlaceholder')}
                  className="flex-1 rounded-lg border border-store-border-strong bg-store-panel px-3 py-2 text-xs text-store-text"
                />
                <button type="button" onClick={addWhitelist} className="rounded-lg border border-store-border-strong px-3 py-2 text-xs font-medium text-store-text">
                  {t('cfg.add')}
                </button>
              </div>
              {values.whitelist.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {values.whitelist.map((w, i) => (
                    <span key={`${w}-${i}`} className="flex items-center gap-1.5 rounded-md bg-store-panel-2 px-2 py-1 font-mono text-xs text-store-text">
                      {w}
                      <button type="button" onClick={() => removeWhitelist(i)} className="text-store-text-3 hover:text-store-red">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-store-text-2">{t('cfg.modelMapping')}</p>
              <div className="flex items-center gap-2">
                <input
                  value={mapFromDraft}
                  onChange={(e) => setMapFromDraft(e.target.value)}
                  placeholder={t('cfg.mapFromPlaceholder')}
                  className="min-w-0 flex-1 rounded-lg border border-store-border-strong bg-store-panel px-3 py-2 text-xs text-store-text"
                />
                <span className="text-store-text-3">→</span>
                <input
                  value={mapToDraft}
                  onChange={(e) => setMapToDraft(e.target.value)}
                  placeholder={t('cfg.mapToPlaceholder')}
                  className="min-w-0 flex-1 rounded-lg border border-store-border-strong bg-store-panel px-3 py-2 text-xs text-store-text"
                />
                <button type="button" onClick={addMapping} className="rounded-lg border border-store-border-strong px-3 py-2 text-xs font-medium text-store-text">
                  {t('cfg.addMapping')}
                </button>
              </div>
              {values.modelMapping.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {values.modelMapping.map((m, i) => (
                    <div key={`${m.from}-${i}`} className="flex items-center gap-2 text-xs text-store-text">
                      <span className="font-mono">{m.from} → {m.to}</span>
                      <button type="button" onClick={() => removeMapping(i)} className="text-store-text-3 hover:text-store-red">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-store-text">{t('cfg.healthCheck')}</p>
                <p className="text-[10px] text-store-text-3">{t('cfg.healthCheckHint')}</p>
              </div>
              <button
                type="button"
                aria-label={t('cfg.healthCheck')}
                aria-pressed={values.healthCheck}
                onClick={() => persist({ ...values, healthCheck: !values.healthCheck })}
                className={`h-6 w-11 rounded-full p-0.5 ${values.healthCheck ? 'bg-store-accent' : 'bg-store-border-strong'}`}
              >
                <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${values.healthCheck ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          </div>
        )}
      </div>

      {helpTip && (
        <div
          style={{ left: helpTip.x, top: helpTip.y }}
          className="pointer-events-none fixed z-[90] max-w-[280px] -translate-x-1/2 rounded-lg border border-store-border-strong bg-black px-3 py-2 text-[11.5px] leading-relaxed text-store-text shadow-lg"
        >
          {helpTip.text}
        </div>
      )}
    </div>
  )
}

function HelpIcon({
  text,
  onShow,
  onHide,
}: {
  text: string
  onShow: (e: React.MouseEvent<HTMLElement>, text: string) => void
  onHide: () => void
}) {
  return (
    <span
      onMouseEnter={(e) => onShow(e, text)}
      onMouseLeave={onHide}
      className="inline-flex cursor-help text-store-text-3 hover:text-store-accent"
    >
      <HelpCircle size={12} />
    </span>
  )
}
