import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Globe } from 'lucide-react'
import type { CatalogResourceDetail, InstalledItem, InstallOutcome, InstallResult, Item, TargetStatus, ToolTarget } from '@as/types'
import { callRpc, errorText, RpcError } from '../../lib/rpc'
import { formatVersion, installedEntryFor, resourceItem } from '../../lib/catalog'
import { describeError, type FriendlyError } from '../../lib/errors'
import { onDeepLink, getLaunchDeepLinks } from '../../lib/deepLink'
import { routeDeepLink } from '../../lib/deepLinkRoute'
import { focusMainWindow } from '../../lib/focusWindow'
import { installStepsOf, requiredKeys, typeFacts, type Category, type SelectedDetail } from '../../lib/detailContent'
import { AGENTS, TARGET_LABEL, joinNames } from '../../lib/agents'
import { useAppState } from '../../state/AppState'
import { useTerminalLog } from '../../state/TerminalLog'
import { useI18n, type TFn } from '../../i18n'
import { CategoryIcon } from '../CategoryIcon'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogTitle } from '../ui/dialog'
import { Banner, Spinner } from '../ui/states'
import { Switch } from '../ui/switch'
import { cn } from '../ui/cn'
import { AgentList, ErrorDetails, Section, Steps } from '../library/parts'
import { SecretInput, upperSnake, type ConfigSchema } from '../library/McpPane'

type NoticeReason = 'invalid' | 'notFound' | 'catalogError' | 'installed' | 'mismatch'
type StepState = 'wait' | 'run' | 'ok' | 'skip' | 'bad'
interface Step {
  key: string
  text: string
  st: StepState
  note?: string
}
interface AgentResult {
  on: boolean
  note?: string
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'notice'; reason: NoticeReason; shown?: string; slug?: string; category?: Category; detail?: string }
  | { kind: 'targets' }
  | { kind: 'vars' }
  | { kind: 'progress' }
  | { kind: 'conflict'; target: ToolTarget }
  | { kind: 'failed'; error: FriendlyError }
  | { kind: 'done' }

interface Flow {
  from: 'app' | 'web'
  /** The catalog id once looked up; before that what asked for it (an id, or a slug from older links). */
  ref: string
  linkRef: string
  phase: Phase
  resource?: CatalogResourceDetail
  item?: Item
  /** A provider already has a config: installing again adds another one (`duplicateProvider`). */
  providerEntry?: string
  tg: Partial<Record<ToolTarget, boolean>>
  vals: Record<string, string>
  skipVars: boolean
  steps: Step[]
  slug?: string
  results: Partial<Record<ToolTarget, AgentResult>>
}

type Lookup =
  | { status: 'installed'; slug: string; category: Category }
  | { status: 'available'; resource: CatalogResourceDetail; providerEntry?: string }
  | { status: 'notFound' }
  | { status: 'catalogError'; detail: string }

async function lookup(ref: string): Promise<Lookup> {
  let resource: CatalogResourceDetail
  try {
    resource = await callRpc<CatalogResourceDetail>('getResource', [ref])
  } catch (err) {
    if (err instanceof RpcError && (err.code === 'ResourceNotFoundError' || err.code === 'AmbiguousResourceError')) {
      // An installed slug may no longer resolve in the catalog; it is still installed.
      if (!ref.includes(':')) {
        const list = await callRpc<InstalledItem[]>('list').catch(() => [] as InstalledItem[])
        const entry = list.find((e) => e.slug === ref)
        if (entry) return { status: 'installed', slug: entry.slug, category: entry.category }
      }
      return { status: 'notFound' }
    }
    return { status: 'catalogError', detail: errorText(err) }
  }
  const list = await callRpc<InstalledItem[]>('list').catch(() => [] as InstalledItem[])
  const entry = installedEntryFor(resource, list)
  // Every provider install is one more config of the same provider, so it is never "already installed".
  if (entry && resource.kind !== 'provider') return { status: 'installed', slug: entry.slug, category: entry.category }
  return { status: 'available', resource, providerEntry: resource.kind === 'provider' ? entry?.slug : undefined }
}

/** Why an agent can't be picked before anything is installed: the engine's own rules, as far as the preview tells. */
function preReason(item: Item, target: ToolTarget, t: TFn): string | undefined {
  if (!item.compatibleWith.includes(target)) return t('errors.incompatible').replace('{tool}', TARGET_LABEL[target])
  if (item.category === 'mcp' && target === 'codex' && item.transport === 'sse') return t('errors.codexSse')
  return undefined
}

function statusReason(s: TargetStatus | undefined, t: TFn): string | undefined {
  const b = s?.blocker
  if (!b) return undefined
  if (b.reason === 'incompatible') return t('errors.incompatible').replace('{tool}', TARGET_LABEL[s.target])
  if (b.reason === 'unsupported') return b.message.includes('SSE') ? t('errors.codexSse') : t('errors.codexHeaders')
  if (b.reason === 'needs-config') return t('mcp.fillFirst')
  return t('prov.fillKey')
}

function outcomeResults(outcome: InstallOutcome, t: TFn): Partial<Record<ToolTarget, AgentResult>> {
  const results: Partial<Record<ToolTarget, AgentResult>> = {}
  for (const target of outcome.enabled) results[target] = { on: true }
  for (const n of outcome.notEnabled) {
    results[n.target] = { on: false, note: statusReason({ target: n.target, compatible: true, enabled: false, blocker: { reason: n.reason, message: n.message } }, t) }
  }
  return results
}

// The launch link stays readable for the whole session, so a remount would replay it.
let launchLinksHandled = false

/** Test hook: lets each test start as a fresh app launch. */
export function resetLaunchLinksForTest() {
  launchLinksHandled = false
}

/**
 * Every install goes through here: the 安装 buttons in the app, and `<scheme>://install?id=…`
 * links from the web store. A link only opens the dialog; installing needs the user's confirmation.
 */
export function InstallDialog() {
  const { locale, t } = useI18n()
  const { installRef, requestInstall, setNavView, setCategoryFilter, setSelectedSlug, setEditingConfigSlug, bumpInstalledVersion } = useAppState()
  const { appendLine } = useTerminalLog()
  const [flow, setFlow] = useState<Flow | null>(null)
  const flowRef = useRef<Flow | null>(null)
  flowRef.current = flow
  // Bumped per request so a slow lookup or install can't overwrite a newer request's dialog.
  const seq = useRef(0)
  const conflictResume = useRef<(() => void) | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  function update(mine: number, patch: Partial<Flow> | ((f: Flow) => Partial<Flow>)) {
    if (seq.current !== mine) return
    setFlow((f) => (f ? { ...f, ...(typeof patch === 'function' ? patch(f) : patch) } : f))
  }

  function show(slug: string, category: Category) {
    setCategoryFilter(category)
    setNavView('browse')
    setEditingConfigSlug(null)
    setSelectedSlug(slug)
  }

  async function start(ref: string, from: Flow['from'], category?: Category) {
    const current = flowRef.current
    // The launch link can arrive twice (once from the launch read, once as an event).
    if (current && (current.ref === ref || current.linkRef === ref) && ['loading', 'targets'].includes(current.phase.kind)) return
    const mine = ++seq.current
    const base: Flow = { from, ref, linkRef: ref, phase: { kind: 'loading' }, tg: {}, vals: {}, skipVars: false, steps: [], results: {} }
    flowRef.current = base
    setFlow(base)
    const found = await lookup(ref)
    if (seq.current !== mine) return
    const shown = ref
    if (found.status === 'notFound') return update(mine, { phase: { kind: 'notice', reason: 'notFound', shown } })
    if (found.status === 'catalogError') return update(mine, { phase: { kind: 'notice', reason: 'catalogError', shown, detail: found.detail } })
    const actual = found.status === 'installed' ? found.category : found.resource.kind
    if (category && category !== actual) return update(mine, { phase: { kind: 'notice', reason: 'mismatch', shown } })
    if (found.status === 'installed') {
      return update(mine, { phase: { kind: 'notice', reason: 'installed', shown, slug: found.slug, category: actual } })
    }
    const item = resourceItem(found.resource)
    const tg: Flow['tg'] = {}
    for (const a of AGENTS) tg[a.id] = !preReason(item, a.id, t)
    if (from === 'web') {
      setCategoryFilter('all')
      setNavView('browse')
      setSelectedSlug(found.resource.id)
    }
    update(mine, { phase: { kind: 'targets' }, resource: found.resource, item, providerEntry: found.providerEntry, tg, ref: found.resource.id })
  }

  async function handleLink(raw: string) {
    const route = routeDeepLink(raw)
    if (route.kind === 'auth-callback') return
    void focusMainWindow()
    if (route.kind === 'invalid') {
      seq.current += 1
      setFlow({ from: 'web', ref: raw, linkRef: raw, phase: { kind: 'notice', reason: 'invalid' }, tg: {}, vals: {}, skipVars: false, steps: [], results: {} })
      return
    }
    await start(route.ref, 'web', route.category)
  }

  const handleLinkRef = useRef(handleLink)
  handleLinkRef.current = handleLink

  useEffect(() => {
    let active = true
    let unlisten = () => {}
    void onDeepLink((url) => void handleLinkRef.current(url)).then((u) => {
      if (active) unlisten = u
      else u()
    })
    void getLaunchDeepLinks().then((urls) => {
      // Marked handled only once a live effect takes them: StrictMode's throwaway
      // first mount would otherwise swallow the link.
      if (!active || launchLinksHandled) return
      launchLinksHandled = true
      for (const url of urls) void handleLinkRef.current(url)
    })
    return () => {
      active = false
      unlisten()
    }
  }, [])

  useEffect(() => {
    if (!installRef) return
    requestInstall(null)
    void start(installRef, 'app')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installRef])

  const phaseKind = flow?.phase.kind
  useEffect(() => {
    if (!phaseKind) return
    const id = requestAnimationFrame(() => {
      const root = contentRef.current
      const target = root?.querySelector<HTMLElement>('[data-autofocus]') ?? root?.querySelector<HTMLElement>('[data-autofocus-wrap] input')
      target?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [phaseKind, flow?.from])

  async function run(f: Flow) {
    const mine = seq.current
    const item = f.item!
    const ref = f.ref
    const chosen = AGENTS.filter((a) => f.tg[a.id]).map((a) => a.id)
    const names = joinNames(chosen.map((c) => TARGET_LABEL[c]), locale)
    const steps: Step[] = []
    if (item.category === 'provider') {
      steps.push({ key: 'install', text: f.providerEntry ? t('inst.pDup').replace('{0}', f.providerEntry) : t('inst.pProvider').replace('{0}', ref), st: 'wait' })
    } else if (item.category === 'skill') {
      steps.push({ key: 'install', text: t('inst.pSkill').replace('{0}', `~/.agent-store/skills/${item.slug}`).replace('{1}', names), st: 'wait' })
    } else {
      steps.push({ key: 'install', text: t('inst.pInstall').replace('{0}', ref), st: 'wait' })
      if (requiredKeys({ ...item, installed: false, resource: f.resource! }).length) {
        steps.push({ key: 'config', text: t('inst.pConfig'), st: f.skipVars ? 'skip' : 'wait', note: f.skipVars ? t('inst.pConfigSkipped') : undefined })
      }
      for (const target of chosen) {
        const a = AGENTS.find((x) => x.id === target)!
        steps.push({ key: target, text: t('inst.pEnable').replace('{0}', `${a.mcpFile} › ${a.mcpKey}.${item.slug}`), st: 'wait' })
      }
    }
    const results: Flow['results'] = {}
    const mark = (key: string, st: StepState, note?: string) =>
      update(mine, (cur) => ({ steps: cur.steps.map((s) => (s.key === key ? { ...s, st, ...(note ? { note } : {}) } : s)) }))
    update(mine, { phase: { kind: 'progress' }, steps, results, skipVars: f.skipVars })

    const fail = (key: string, err: unknown) => {
      appendLine(`✗ ${errorText(err)}`, 'red')
      mark(key, 'bad')
      update(mine, { phase: { kind: 'failed', error: describeError(err, t) } })
      bumpInstalledVersion()
    }

    if (item.category === 'provider') {
      mark('install', 'run')
      try {
        if (f.providerEntry) {
          appendLine(`$ aas duplicate ${f.providerEntry}`)
          const { newSlug } = await callRpc<{ newSlug: string }>('duplicateProvider', [f.providerEntry])
          appendLine(`✓ ${t('lib.childAdded')} ${newSlug}`, 'green')
          mark('install', 'ok')
          update(mine, { slug: newSlug, results: {}, phase: { kind: 'done' } })
        } else {
          appendLine(`$ aas install ${ref}`)
          const outcome = await callRpc<InstallOutcome>('installAndEnable', [ref])
          appendLine(`✓ ${t('st.installed')} ${outcome.slug} ${outcome.version}`, 'green')
          mark('install', 'ok')
          update(mine, { slug: outcome.slug, results: outcomeResults(outcome, t), phase: { kind: 'done' } })
        }
      } catch (err) {
        return fail('install', err)
      }
      bumpInstalledVersion()
      return
    }

    if (item.category === 'skill') {
      mark('install', 'run')
      const compatible = AGENTS.filter((a) => item.compatibleWith.includes(a.id)).map((a) => a.id)
      const options = chosen.length === compatible.length ? undefined : { target: chosen[0] }
      appendLine(`$ aas install ${ref}${options ? ` --target ${options.target}` : ''}`)
      try {
        const outcome = await callRpc<InstallOutcome>('installAndEnable', options ? [ref, options] : [ref])
        appendLine(`✓ ${t('st.installed')} ${outcome.slug} ${outcome.version}`, 'green')
        mark('install', 'ok')
        update(mine, { slug: outcome.slug, results: outcomeResults(outcome, t), phase: { kind: 'done' } })
      } catch (err) {
        return fail('install', err)
      }
      bumpInstalledVersion()
      return
    }

    mark('install', 'run')
    appendLine(`$ aas install ${ref}`)
    let slug: string
    try {
      const result = await callRpc<InstallResult>('install', [ref])
      slug = result.slug
      appendLine(`✓ ${t('st.installed')} ${result.slug} ${result.version}`, 'green')
      mark('install', 'ok')
      update(mine, { slug })
    } catch (err) {
      return fail('install', err)
    }

    const values = Object.fromEntries(Object.entries(f.vals).filter(([, v]) => v !== ''))
    if (!f.skipVars && Object.keys(values).length) {
      mark('config', 'run')
      appendLine(`$ aas config ${slug}`)
      try {
        await callRpc('setConfig', [slug, values])
        mark('config', 'ok')
      } catch (err) {
        appendLine(`✗ ${errorText(err)}`, 'red')
        mark('config', 'bad', describeError(err, t).message)
      }
    }

    const status = await callRpc<TargetStatus[]>('getTargetStatus', [slug]).catch(() => [] as TargetStatus[])
    for (const target of chosen) {
      const reason = statusReason(status.find((s) => s.target === target), t)
      if (reason) {
        mark(target, 'skip', reason)
        results[target] = { on: false, note: reason }
        continue
      }
      mark(target, 'run')
      appendLine(`$ aas enable ${slug} --for ${target}`)
      try {
        await callRpc('enable', [slug, target])
        appendLine(`✓ ${t('lib.enabledLog').replace('{0}', TARGET_LABEL[target])} ${slug}`, 'green')
        mark(target, 'ok')
        results[target] = { on: true }
      } catch (err) {
        appendLine(`✗ ${errorText(err)}`, 'red')
        if (err instanceof RpcError && err.code === 'McpConflictError') {
          update(mine, { phase: { kind: 'conflict', target } })
          await new Promise<void>((resolve) => {
            conflictResume.current = resolve
          })
          if (seq.current !== mine) return
          mark(target, 'skip', t('inst.skipped'))
          results[target] = { on: false, note: t('inst.skipped') }
          update(mine, { phase: { kind: 'progress' } })
        } else {
          const friendly = describeError(err, t)
          mark(target, 'bad', friendly.message)
          results[target] = { on: false, note: friendly.message }
        }
      }
    }
    update(mine, { results: { ...results }, phase: { kind: 'done' } })
    bumpInstalledVersion()
  }

  const busy = phaseKind === 'progress' || phaseKind === 'conflict'

  function close() {
    if (busy) return
    seq.current += 1
    setFlow(null)
  }

  function openResult() {
    if (!flow?.slug || !flow.item) return
    show(flow.slug, flow.item.category)
    close()
  }

  const item = flow?.item

  return (
    <Dialog open={flow !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent
        ref={contentRef}
        aria-describedby={undefined}
        layer="top"
        data-kind={item?.category}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onPointerDownOutside={(e) => busy && e.preventDefault()}
        onInteractOutside={(e) => busy && e.preventDefault()}
      >
        {flow && <Body flow={flow} setFlow={setFlow} onSubmitVars={() => void run({ ...flow, skipVars: false })} />}
        <DialogFooter>
          <Footer
            flow={flow}
            close={close}
            onNext={(next) => setFlow((f) => (f ? { ...f, ...next } : f))}
            onRun={(f) => void run(f)}
            onSkipConflict={() => conflictResume.current?.()}
            onView={(slug, category) => {
              show(slug, category)
              close()
            }}
            onOpenResult={openResult}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ItemSummary({ item, resource }: { item: Item; resource: CatalogResourceDetail }) {
  const t = useI18n().t
  return (
    <div data-kind={item.category} className="mb-3.5 mt-3 flex items-center gap-3">
      <CategoryIcon category={item.category} />
      <div className="min-w-0">
        <b className="block font-bold">{item.name}</b>
        <small className="block break-all font-mono text-[11.5px] text-fg-3">
          {resource.id}
          {item.version ? ` · ${formatVersion(item.version)}` : ''}
        </small>
        <small className="block text-[11.5px] text-fg-3">
          {t('inst.publisher')} {item.publisher.name} · {t(`categories.${item.category}`)}
        </small>
      </div>
    </div>
  )
}

function WebNotice() {
  const t = useI18n().t
  return (
    <div className="mt-3 flex items-start gap-2 rounded-[9px] border border-warn/35 bg-warn/[0.07] px-2.5 py-2 text-xs">
      <Globe size={14} className="mt-0.5 flex-none text-warn" />
      <span>{t('inst.fromWeb')}</span>
    </div>
  )
}

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ul className="mt-1.5 flex flex-col gap-2">
      {steps.map((s) => (
        <li
          key={s.key}
          className={cn(
            'flex items-start gap-2.5 text-[12.5px]',
            s.st === 'run' ? 'text-fg' : s.st === 'bad' ? 'text-bad' : s.st === 'ok' ? 'text-fg-2' : 'text-fg-3'
          )}
        >
          <span
            aria-hidden
            className={cn(
              'mt-0.5 grid h-4 w-4 flex-none place-items-center rounded-full border-[1.5px]',
              s.st === 'ok' && 'border-provider bg-provider text-canvas',
              s.st === 'run' && 'as-spin border-kind border-t-transparent',
              s.st === 'bad' && 'border-bad',
              s.st === 'skip' && 'border-dashed border-line-strong',
              s.st === 'wait' && 'border-line-strong'
            )}
          >
            {s.st === 'ok' && <Check size={10} strokeWidth={3} />}
          </span>
          <span className="min-w-0">
            <code className="break-all font-mono text-[11.5px]">{s.text}</code>
            {s.note && <span className="block">{s.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Body({ flow, setFlow, onSubmitVars }: { flow: Flow; setFlow: (fn: (f: Flow | null) => Flow | null) => void; onSubmitVars: () => void }) {
  const { locale, t } = useI18n()
  const { phase, item, resource } = flow

  if (phase.kind === 'loading') {
    return (
      <DialogBody>
        <DialogTitle>{t('inst.confirm')}</DialogTitle>
        <p role="status" className="mt-3 flex items-center gap-2.5 text-[13px] text-fg-2">
          <Spinner />
          {t('inst.loading')} <code className="break-all font-mono text-xs text-fg">{flow.ref}</code>
        </p>
      </DialogBody>
    )
  }

  if (phase.kind === 'notice') {
    return (
      <DialogBody>
        <DialogTitle>{t(`link.${phase.reason}T`)}</DialogTitle>
        <p className="mb-3.5 text-[13px] text-fg-2">{t(`link.${phase.reason}D`)}</p>
        {(phase.shown ?? (phase.reason === 'invalid' ? flow.ref : undefined)) && (
          <p className="break-all rounded-[9px] border border-line bg-code px-[11px] py-[9px] font-mono text-xs">{phase.shown ?? flow.ref}</p>
        )}
        <ErrorDetails detail={phase.detail} />
      </DialogBody>
    )
  }

  if (!item || !resource) return null
  const detail: SelectedDetail = { ...item, installed: false, resource }
  const schema = ((item as { configSchema?: ConfigSchema }).configSchema ?? {}) as ConfigSchema
  const required = requiredKeys(detail)

  if (phase.kind === 'targets') {
    const provider = item.category === 'provider'
    return (
      <DialogBody>
        <DialogTitle>{flow.from === 'web' ? t('inst.confirm') : t('inst.title').replace('{0}', item.name)}</DialogTitle>
        <ItemSummary item={item} resource={resource} />
        {provider ? (
          <p className="text-[12.5px] text-fg-2">{flow.providerEntry ? t('inst.provAgain') : t('inst.providerNext')}</p>
        ) : (
          <Section title={t('inst.targets')} className="mt-0">
            <AgentList
              lines={AGENTS.map((agent) => {
                const reason = preReason(item, agent.id, t)
                return {
                  agent,
                  note: reason ?? (item.category === 'skill' ? `${agent.skillsDir}/` : agent.mcpFile),
                  noteMono: !reason,
                  right: (
                    <Switch
                      kind={item.category}
                      aria-label={agent.name}
                      checked={!!flow.tg[agent.id]}
                      disabled={!!reason}
                      onCheckedChange={(v) => setFlow((f) => (f ? { ...f, tg: { ...f.tg, [agent.id]: v } } : f))}
                    />
                  ),
                }
              })}
            />
          </Section>
        )}
        {resource.installError ? (
          <div className="mt-4">
            <Banner tone="error" title={t('catalog.notInstallable')}>
              <p>{t('errors.notInstallable')}</p>
              <ErrorDetails detail={resource.installError} />
            </Banner>
          </div>
        ) : (
          <Section title={t('sec.writes')}>
            <Steps lines={[...installStepsOf(detail, t), ...typeFacts(detail, t)]} />
          </Section>
        )}
        {flow.from === 'web' && <WebNotice />}
      </DialogBody>
    )
  }

  if (phase.kind === 'vars') {
    const fields = required.map((key) => [key, schema.properties?.[key] ?? {}] as const)
    return (
      <DialogBody>
        <form
          id="install-vars"
          onSubmit={(e) => {
            e.preventDefault()
            if (required.every((k) => (flow.vals[k] ?? '') !== '')) onSubmitVars()
          }}
        >
          <DialogTitle>{t('inst.vars')}</DialogTitle>
          <p className="mb-3.5 text-[13px] text-fg-2">{t('inst.varsD')}</p>
          {fields.map(([key, prop], i) => {
            const id = `install-var-${key}`
            return (
              <div key={key} className="mb-3">
                <label htmlFor={id} className="mb-[5px] flex items-center gap-1.5 text-[11.5px] font-semibold text-fg-2">
                  {prop.description ?? prop.title ?? key} <span className="text-bad">*</span>
                </label>
                <div {...(i === 0 ? { 'data-autofocus-wrap': true } : {})}>
                  <SecretInput
                    id={id}
                    secret={prop['x-secret'] !== false}
                    value={flow.vals[key] ?? ''}
                    placeholder={prop['x-env'] ?? upperSnake(key)}
                    onChange={(v) => setFlow((f) => (f ? { ...f, vals: { ...f.vals, [key]: v } } : f))}
                  />
                </div>
                {prop['x-bearer'] && flow.tg.codex && (
                  <p className="mt-1 text-[11.5px] text-fg-3">
                    {t('mcp.codexEnv')} <code className="font-mono text-[11px] text-fg-2">export {prop['x-env'] ?? upperSnake(key)}=…</code>
                  </p>
                )}
              </div>
            )
          })}
        </form>
      </DialogBody>
    )
  }

  if (phase.kind === 'progress' || phase.kind === 'conflict' || phase.kind === 'failed') {
    return (
      <DialogBody>
        <DialogTitle>{t(phase.kind === 'failed' ? 'inst.failed' : 'inst.running').replace('{0}', item.name)}</DialogTitle>
        <ItemSummary item={item} resource={resource} />
        <StepList steps={flow.steps} />
        {phase.kind === 'conflict' && (
          <div className="mt-3.5">
            <Banner tone="warn" title={t('inst.conflictT').replace('{0}', TARGET_LABEL[phase.target])}>
              <p>{t('inst.conflictD').replace(/\{0\}/g, TARGET_LABEL[phase.target])}</p>
            </Banner>
          </div>
        )}
        {phase.kind === 'failed' && (
          <div className="mt-3.5">
            <Banner tone="error" title={t('inst.failedT')}>
              <p>{phase.error.message}</p>
              <ErrorDetails detail={phase.error.detail} />
            </Banner>
          </div>
        )}
      </DialogBody>
    )
  }

  const on = AGENTS.filter((a) => flow.results[a.id]?.on).map((a) => a.name)
  const providerAdded = item.category === 'provider' && on.length === 0
  const lede = providerAdded
    ? t('inst.doneProv')
    : on.length
      ? t('inst.doneOn').replace('{0}', joinNames(on, locale))
      : t(flow.skipVars ? 'inst.doneSkip' : 'inst.doneOff')
  return (
    <DialogBody>
      <div data-kind={item.category} className="grid justify-items-center gap-1.5 pb-1 pt-3.5 text-center">
        <span className="mb-2 grid h-16 w-16 place-items-center rounded-full bg-kind text-canvas shadow-[0_0_0_8px_rgb(var(--kind-rgb)/0.14),0_0_60px_rgb(var(--kind-rgb)/0.7)]">
          <Check size={30} strokeWidth={2.6} />
        </span>
        <DialogTitle className="text-[17px]">{t('inst.done').replace('{0}', item.name)}</DialogTitle>
        <p className="max-w-[40ch] text-[13px] text-fg-2">{lede}</p>
      </div>
      {item.category !== 'provider' && (
        <div className="mt-3.5">
          <AgentList
            lines={AGENTS.map((agent) => {
              const r = flow.results[agent.id]
              const chosen = !!flow.tg[agent.id]
              const note = r?.on ? '' : (r?.note ?? preReason(item, agent.id, t) ?? (chosen ? t('st.off') : t('inst.notChosen')))
              return {
                agent,
                note,
                right: <Badge tone={r?.on ? 'ok' : 'neutral'}>{t(r?.on ? 'st.on' : 'st.off')}</Badge>,
              }
            })}
          />
        </div>
      )}
    </DialogBody>
  )
}

function Footer({
  flow,
  close,
  onNext,
  onRun,
  onSkipConflict,
  onView,
  onOpenResult,
}: {
  flow: Flow | null
  close: () => void
  onNext: (patch: Partial<Flow>) => void
  onRun: (f: Flow) => void
  onSkipConflict: () => void
  onView: (slug: string, category: Category) => void
  onOpenResult: () => void
}): ReactNode {
  const t = useI18n().t
  if (!flow) return null
  const { phase, item, resource } = flow
  const web = flow.from === 'web'

  if (phase.kind === 'loading') return <Button data-autofocus onClick={close}>{t('common.cancel')}</Button>

  if (phase.kind === 'notice') {
    return (
      <>
        <Button data-autofocus onClick={close}>
          {t('ui.close')}
        </Button>
        {phase.reason === 'installed' && phase.slug && phase.category && (
          <Button variant="primary" onClick={() => onView(phase.slug!, phase.category!)}>
            {t('inst.view')}
          </Button>
        )}
      </>
    )
  }

  if (!item || !resource) return null
  const required = requiredKeys({ ...item, installed: false, resource })
  const chosen = AGENTS.filter((a) => flow.tg[a.id])

  if (phase.kind === 'targets') {
    const provider = item.category === 'provider'
    const none = !provider && chosen.length === 0
    const skillNeedsOne = item.category === 'skill' && none
    const needVars = item.category === 'mcp' && required.length > 0 && chosen.length > 0
    const label = provider ? t(flow.providerEntry ? 'act.addCfg' : 'act.install') : none ? t('inst.only') : needVars ? t('inst.next') : t('act.install')
    return (
      <>
        {/* First in the DOM, and focused for web links: Enter must not install. */}
        <Button {...(web ? { 'data-autofocus': true } : {})} onClick={close}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          {...(web ? {} : { 'data-autofocus': true })}
          disabled={!!resource.installError || skillNeedsOne}
          title={skillNeedsOne ? t('inst.needOne') : undefined}
          onClick={() => (needVars ? onNext({ phase: { kind: 'vars' } }) : onRun({ ...flow, skipVars: false }))}
        >
          {label}
        </Button>
      </>
    )
  }

  if (phase.kind === 'vars') {
    const full = required.every((k) => (flow.vals[k] ?? '') !== '')
    return (
      <>
        <Button onClick={() => onNext({ phase: { kind: 'targets' } })}>{t('inst.back')}</Button>
        <span className="flex-1" />
        <Button onClick={() => onRun({ ...flow, skipVars: true })}>{t('inst.later')}</Button>
        <Button variant="primary" type="submit" form="install-vars" disabled={!full}>
          {t('act.install')}
        </Button>
      </>
    )
  }

  if (phase.kind === 'progress') {
    return (
      <>
        <span role="status" className="text-[12.5px] text-fg-3">
          {t('inst.wait')}
        </span>
        <span className="flex-1" />
        <Button disabled>{t('inst.installing')}</Button>
      </>
    )
  }

  if (phase.kind === 'conflict') {
    return (
      <Button data-autofocus onClick={onSkipConflict}>
        {t('inst.skip').replace('{0}', TARGET_LABEL[phase.target])}
      </Button>
    )
  }

  if (phase.kind === 'failed') {
    return (
      <>
        <Button data-autofocus onClick={close}>
          {t('ui.close')}
        </Button>
        <Button variant="primary" onClick={() => onNext({ phase: { kind: 'targets' }, steps: [], results: {} })}>
          {t('ui.retry')}
        </Button>
      </>
    )
  }

  const openCfg = item.category === 'provider' || flow.skipVars
  return (
    <>
      <Button onClick={close}>{t('inst.finish')}</Button>
      <Button variant="primary" data-autofocus onClick={onOpenResult}>
        {t(openCfg ? 'inst.openCfg' : 'inst.view')}
      </Button>
    </>
  )
}
