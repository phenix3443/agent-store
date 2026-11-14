import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, RefreshCw, Undo2 } from 'lucide-react'
import type { AgentDetection, ImportApplyResult, ImportScan, McpCandidate, SkillCandidate } from '@as/types'
import { useAppState } from '../state/AppState'
import { readLocalState, writeLocalState } from '../state/LocalPersistence'
import { useI18n, type TFn } from '../i18n'
import { AGENTS, TARGET_LABEL, joinNames } from '../lib/agents'
import { callRpc, errorText } from '../lib/rpc'
import { modKeyLabel } from '../lib/nav'
import { useNavigate } from '../lib/useNavigate'
import { AgentMark } from './AgentMark'
import { Badge, Kbd } from './ui/badge'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { Row, RowGroup } from './ui/card'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogTitle } from './ui/dialog'
import { Banner, Spinner } from './ui/states'

const WELCOME_KEY = 'welcome'

interface WelcomeState {
  seenAt: string
}

/** Opens the welcome dialog once, on the first launch that has no record of it. */
export function useFirstRunWelcome() {
  const { setShellDialog } = useAppState()
  useEffect(() => {
    let active = true
    readLocalState<WelcomeState | null>(WELCOME_KEY, null).then(
      (seen) => {
        if (active && !seen) setShellDialog('welcome')
      },
      // No app data dir (a plain browser tab): don't nag on every load.
      () => undefined
    )
    return () => {
      active = false
    }
  }, [setShellDialog])
}

type Load<T> = { status: 'loading' } | { status: 'done'; data: T } | { status: 'failed'; error: string }
type Step = 'agents' | 'import' | 'done'

const fill = (s: string, ...v: (string | number)[]) => v.reduce<string>((acc, x, i) => acc.replace(`{${i}}`, String(x)), s)

function Mono({ children }: { children: ReactNode }) {
  return <code className="break-all font-mono text-[11px] text-fg-3">{children}</code>
}

function Heading({ children }: { children: ReactNode }) {
  return <p className="mb-2 ml-0.5 text-xs font-semibold text-fg-3">{children}</p>
}

function StepMark({ step, total }: { step: number; total: number }) {
  const { t } = useI18n()
  return (
    <p className="mb-3 flex items-center gap-1.5" aria-label={fill(t('onboard.step'), step, total)}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} aria-hidden className={`h-1 w-6 rounded-full ${i < step ? 'bg-fg' : 'bg-line-strong'}`} />
      ))}
    </p>
  )
}

function agentNote(a: AgentDetection, t: TFn): string | null {
  if (!a.detected) return fill(t('onboard.agents.missing'), a.agent, a.configDir)
  if (!a.binary) return fill(t('onboard.agents.cliMissing'), a.agent, a.mcpConfigPath)
  return null
}

/** One row per agent: found or not, version, where its config is, and what changes without its CLI. */
export function AgentRows({ agents, showEnv = false }: { agents: Load<AgentDetection[]>; showEnv?: boolean }) {
  const { t } = useI18n()
  return (
    <RowGroup>
      {AGENTS.map((meta) => {
        const a = agents.status === 'done' ? agents.data.find((d) => d.agent === meta.id) : undefined
        const note = a ? agentNote(a, t) : null
        return (
          <Row
            key={meta.id}
            title={
              <>
                <AgentMark mark={meta.mark} />
                {meta.name}
                {a?.version && <span className="font-mono text-[11px] font-normal text-fg-3">{a.version}</span>}
              </>
            }
            sub={
              <>
                <Mono>{a ? `${a.configDir} · ${a.mcpConfigPath}` : `${meta.skills} · ${meta.mcp}`}</Mono>
                {showEnv && (
                  <>
                    {' · '}
                    {t('onboard.agents.env').split('{0}')[0]}
                    <Mono>{meta.env}</Mono>
                    {t('onboard.agents.env').split('{0}')[1]}
                  </>
                )}
                {note && <span className="mt-0.5 block">{note}</span>}
              </>
            }
          >
            {agents.status === 'loading' && <Spinner className="h-3.5 w-3.5" label={t('onboard.agents.detecting')} />}
            {a && (
              <Badge tone={a.detected ? 'ok' : 'warn'}>
                {a.detected && <Check />}
                {t(a.detected ? 'onboard.agents.found' : 'onboard.agents.notFound')}
              </Badge>
            )}
          </Row>
        )
      })}
      <Row
        muted
        title={
          <>
            <AgentMark mark="+" soon />
            {t('welcome.more')}
          </>
        }
        sub={t('welcome.moreDesc')}
      />
    </RowGroup>
  )
}

function Candidate({ id, kind, checked, disabled, onToggle, title, children, badge }: {
  id: string
  kind: 'skill' | 'mcp'
  checked: boolean
  disabled?: boolean
  onToggle: (id: string) => void
  title: ReactNode
  children: ReactNode
  badge?: ReactNode
}) {
  return (
    <label className={`flex items-start gap-3 border-b border-line px-3.5 py-[10px] last:border-b-0 ${disabled ? 'opacity-60' : 'cursor-pointer hover:bg-panel'}`}>
      <Checkbox
        data-kind={kind}
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        onChange={() => onToggle(id)}
      />
      <span className="min-w-0 flex-1">
        <b className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
          {title}
          {badge}
        </b>
        <small className="mt-0.5 block text-xs text-fg-3">{children}</small>
      </span>
    </label>
  )
}

function SkillRow({ s, checked, onToggle }: { s: SkillCandidate; checked: boolean; onToggle: (id: string) => void }) {
  const { t, locale } = useI18n()
  const agents = joinNames([...new Set(s.locations.map((l) => TARGET_LABEL[l.agent]))], locale)
  const reason = s.reason ? fill(t(`onboard.import.reason.${s.reason}`), s.locations[0]?.linkTarget ?? '') : null
  return (
    <Candidate
      id={s.id}
      kind="skill"
      checked={checked}
      disabled={!s.importable}
      onToggle={onToggle}
      title={s.name ?? s.dirName}
      badge={s.catalog?.exact ? <Badge>{t('onboard.import.sameAsCatalog')}</Badge> : undefined}
    >
      {agents}
      {s.locations.map((l) => (
        <span key={l.path} className="block">
          <Mono>{l.path}</Mono>
        </span>
      ))}
      {s.importable && s.locations.some((l) => l.root === 'agents') && <span className="block">{t('onboard.import.shared')}</span>}
      {reason && <span className="block text-warn">{reason}</span>}
    </Candidate>
  )
}

function McpRow({ m, checked, onToggle }: { m: McpCandidate; checked: boolean; onToggle: (id: string) => void }) {
  const { t, locale } = useI18n()
  const env = [...new Set(m.entries.flatMap((e) => e.envNames))]
  return (
    <Candidate
      id={m.id}
      kind="mcp"
      checked={checked}
      onToggle={onToggle}
      title={m.name}
      badge={m.catalog?.exact ? <Badge>{t('onboard.import.sameAsCatalog')}</Badge> : undefined}
    >
      {joinNames(m.entries.map((e) => TARGET_LABEL[e.agent]), locale)}
      {m.entries.map((e) => (
        <span key={e.agent} className="block">
          <Mono>{e.transport === 'stdio' ? [e.command, ...(e.args ?? [])].join(' ') : e.url}</Mono>
        </span>
      ))}
      {env.length > 0 && <span className="block">{fill(t('onboard.import.env'), joinNames(env, locale))}</span>}
      {m.entries
        .filter((e) => e.lossyKeys.length)
        .map((e) => (
          <span key={`lossy-${e.agent}`} className="block text-warn">
            {fill(t('onboard.import.lossy'), e.agent, e.lossyKeys.join(', '))}
          </span>
        ))}
    </Candidate>
  )
}

/** Checked at first: everything importable except skills in ~/.agents/skills, which other tools read too. */
export function defaultSelection(scan: ImportScan): string[] {
  return [
    ...scan.skills.filter((s) => s.importable && !s.locations.some((l) => l.root === 'agents')).map((s) => s.id),
    ...scan.mcps.filter((m) => m.importable).map((m) => m.id),
  ]
}

/** The first-run guide: detected agents, then what the user already has, then the result. Nothing is written until 导入所选. */
export function WelcomeDialog() {
  const { t, locale } = useI18n()
  const { shellDialog, setShellDialog, bumpInstalledVersion } = useAppState()
  const navigate = useNavigate()
  const primaryRef = useRef<HTMLButtonElement>(null)
  const open = shellDialog === 'welcome' || shellDialog === 'import'
  const [step, setStep] = useState<Step>('agents')
  const [agents, setAgents] = useState<Load<AgentDetection[]>>({ status: 'loading' })
  const [scan, setScan] = useState<Load<ImportScan>>({ status: 'loading' })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<'apply' | 'undo' | null>(null)
  const [applied, setApplied] = useState<ImportApplyResult | null>(null)
  const [undone, setUndone] = useState(false)
  const [error, setError] = useState<{ title: string; detail: string } | null>(null)
  const [matchCatalog, setMatchCatalog] = useState(false)

  function detect() {
    setAgents({ status: 'loading' })
    callRpc<AgentDetection[]>('detectAgents').then(
      (data) => setAgents({ status: 'done', data }),
      (err) => setAgents({ status: 'failed', error: errorText(err) })
    )
  }

  function rescan(match = matchCatalog) {
    setScan({ status: 'loading' })
    callRpc<ImportScan>('importScan', [{ matchCatalog: match }]).then(
      (data) => {
        setScan({ status: 'done', data })
        setSelected(new Set(defaultSelection(data)))
      },
      (err) => setScan({ status: 'failed', error: errorText(err) })
    )
  }

  useEffect(() => {
    if (!open) return
    setStep(shellDialog === 'import' ? 'import' : 'agents')
    setApplied(null)
    setUndone(false)
    setError(null)
    setMatchCatalog(false)
    detect()
    rescan(false)
  }, [open])

  useEffect(() => {
    if (open) primaryRef.current?.focus()
  }, [open, step, scan.status])

  function finish(goDiscover: boolean) {
    if (busy) return
    setShellDialog(null)
    if (goDiscover) navigate('discover')
    writeLocalState<WelcomeState>(WELCOME_KEY, { seenAt: new Date().toISOString() }).catch(() => undefined)
  }

  const found = scan.status === 'done' ? scan.data.skills.length + scan.data.mcps.length : 0
  // The import step is skipped when there is nothing to show; it is still reachable from Settings.
  const total = scan.status === 'done' && found === 0 ? 2 : 3
  const number = step === 'agents' ? 1 : step === 'import' ? 2 : total

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function apply() {
    setBusy('apply')
    setError(null)
    try {
      const result = await callRpc<ImportApplyResult>('importApply', [[...selected], { matchCatalog }])
      setApplied(result)
      bumpInstalledVersion()
      setStep('done')
    } catch (err) {
      setError({ title: t('onboard.import.applyFailed'), detail: errorText(err) })
      rescan()
    } finally {
      setBusy(null)
    }
  }

  async function undo() {
    if (!applied) return
    setBusy('undo')
    setError(null)
    try {
      await callRpc('importUndo', [applied.importId, {}])
      setUndone(true)
      bumpInstalledVersion()
    } catch (err) {
      setError({ title: t('onboard.done.undoFailed'), detail: errorText(err) })
    } finally {
      setBusy(null)
    }
  }

  let body: ReactNode
  if (step === 'agents') {
    body = (
      <>
        <DialogTitle className="text-[26px] leading-tight">
          {t('welcome.titleA')}
          <span className="bg-[image:var(--brand)] bg-clip-text text-transparent">{t('welcome.titleB')}</span>
        </DialogTitle>
        <DialogDescription className="mb-5 mt-2 max-w-[56ch] text-sm">{t('onboard.agents.lede')}</DialogDescription>
        <Heading>{t('onboard.agents.heading')}</Heading>
        <AgentRows agents={agents} />
        {agents.status === 'failed' && <Banner tone="error" title={t('onboard.agents.failed')}>{agents.error}</Banner>}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button ref={primaryRef} variant="primary" onClick={() => setStep(scan.status === 'done' && found === 0 ? 'done' : 'import')}>
            {t('onboard.agents.next')}
          </Button>
          <Button onClick={detect} disabled={agents.status === 'loading'}>
            <RefreshCw />
            {t('onboard.settings.detect')}
          </Button>
        </div>
      </>
    )
  } else if (step === 'import') {
    const data = scan.status === 'done' ? scan.data : null
    body = (
      <>
        <DialogTitle className="text-[22px] leading-tight">{t('onboard.import.title')}</DialogTitle>
        <DialogDescription className="mb-4 mt-2 max-w-[60ch] text-[13px]">{t('onboard.import.lede')}</DialogDescription>
        <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-box border border-line px-3.5 py-[10px] hover:bg-panel">
          <Checkbox
            className="mt-0.5"
            checked={matchCatalog}
            disabled={scan.status === 'loading' || busy !== null}
            onChange={() => {
              const next = !matchCatalog
              setMatchCatalog(next)
              rescan(next)
            }}
          />
          <span className="min-w-0 flex-1">
            <b className="block text-[13px] font-semibold">{t('onboard.import.match')}</b>
            <small className="mt-0.5 block text-xs text-fg-3">{t('onboard.import.matchSub')}</small>
          </span>
        </label>
        {scan.status === 'loading' && (
          <p className="flex items-center gap-2 text-[13px] text-fg-2">
            <Spinner className="h-3.5 w-3.5" />
            {t('onboard.import.scanning')}
          </p>
        )}
        {scan.status === 'failed' && (
          <Banner tone="error" title={t('onboard.import.failed')} actions={<Button size="sm" onClick={() => rescan()}>{t('onboard.import.retry')}</Button>}>
            {scan.error}
          </Banner>
        )}
        {data && found === 0 && <Banner tone="info" title={t('onboard.import.none')} />}
        {data?.problems.map((p) => (
          <div key={p.path} className="mb-3">
            <Banner tone="warn" title={fill(t('onboard.import.problem'), p.path)} />
          </div>
        ))}
        {data && data.skills.length > 0 && (
          <>
            <Heading>{fill(t('onboard.import.skills'), data.skills.length)}</Heading>
            <div className="mb-4 flex flex-col overflow-hidden rounded-box border border-line">
              {data.skills.map((s) => (
                <SkillRow key={s.id} s={s} checked={selected.has(s.id)} onToggle={toggle} />
              ))}
            </div>
          </>
        )}
        {data && data.mcps.length > 0 && (
          <>
            <Heading>{fill(t('onboard.import.mcps'), data.mcps.length)}</Heading>
            <div className="mb-4 flex flex-col overflow-hidden rounded-box border border-line">
              {data.mcps.map((m) => (
                <McpRow key={m.id} m={m} checked={selected.has(m.id)} onToggle={toggle} />
              ))}
            </div>
          </>
        )}
        {error && <Banner tone="error" title={error.title}>{error.detail}</Banner>}
        <div className="mt-5 flex flex-wrap gap-2">
          {found > 0 && (
            <Button ref={primaryRef} variant="primary" disabled={selected.size === 0 || busy !== null} onClick={() => void apply()}>
              {busy === 'apply' && <Spinner className="h-3.5 w-3.5" />}
              {busy === 'apply' ? t('onboard.import.applying') : fill(t('onboard.import.apply'), selected.size)}
            </Button>
          )}
          <Button ref={found > 0 ? undefined : primaryRef} disabled={busy !== null} onClick={() => setStep('done')}>
            {t(found > 0 ? 'onboard.import.skip' : 'onboard.agents.next')}
          </Button>
        </div>
      </>
    )
  } else {
    body = (
      <>
        <DialogTitle className="text-[22px] leading-tight">
          {applied && !undone ? fill(t('onboard.done.imported'), applied.items.length) : t('onboard.done.ready')}
        </DialogTitle>
        {applied && !undone && (
          <>
            <DialogDescription className="mb-4 mt-2 text-[13px]">{t('onboard.done.importedLede')}</DialogDescription>
            <RowGroup>
              {applied.items.map((i) => (
                <Row key={i.id} title={i.slug} sub={joinNames(i.agents.map((a) => TARGET_LABEL[a]), locale)} />
              ))}
            </RowGroup>
          </>
        )}
        {undone && <Banner tone="info" title={t('onboard.done.undone')} />}
        {error && <Banner tone="error" title={error.title}>{error.detail}</Banner>}
        <RowGroup className="mb-0 mt-4">
          <Row title={t('welcome.tip1')} sub={t('welcome.tip1d')}>
            <Kbd>{modKeyLabel()} K</Kbd>
          </Row>
          <Row title={t('welcome.tip2')} sub={t('welcome.tip2d')} />
          <Row title={t('welcome.tip3')} sub={t('welcome.tip3d')} />
        </RowGroup>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button ref={primaryRef} variant="primary" disabled={busy !== null} onClick={() => finish(true)}>
            {t('welcome.start')}
          </Button>
          {applied && !undone && (
            <Button disabled={busy !== null} onClick={() => void undo()}>
              {busy === 'undo' ? <Spinner className="h-3.5 w-3.5" /> : <Undo2 />}
              {busy === 'undo' ? t('onboard.done.undoing') : t('onboard.done.undo')}
            </Button>
          )}
        </div>
      </>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && finish(false)}>
      <DialogContent
        width="wide"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          primaryRef.current?.focus()
        }}
        className="max-h-[calc(100vh-48px)] bg-[radial-gradient(45%_55%_at_15%_0%,rgb(var(--skill-rgb)/0.2),transparent_70%),radial-gradient(45%_55%_at_85%_0%,rgb(var(--provider-rgb)/0.14),transparent_70%)] bg-overlay"
      >
        <DialogBody className="px-7 pb-6 pt-7">
          <StepMark step={number} total={total} />
          {body}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
