import { useEffect, useState, type ReactNode } from 'react'
import { Ban, Check, Download, Upload } from 'lucide-react'
import type { BackupHistoryEntry, BackupItemRef, BackupSnapshot, BackupStatus } from '@as/types'
import { useI18n, useT } from '../../i18n'
import { joinNames, TARGET_LABEL } from '../../lib/agents'
import {
  describeBackupError, describeFinding, formatWhen, snapshotLabel, splitFindingPath, syncState, uploadedCount, type SyncState,
} from '../../lib/backup'
import type { Section as NavSection } from '../../lib/nav'
import { useNavigate } from '../../lib/useNavigate'
import { useAppState } from '../../state/AppState'
import { useBackup } from '../../state/Backup'
import { CategoryIcon } from '../CategoryIcon'
import { ErrorDetails } from '../library/parts'
import { Badge, type BadgeTone } from '../ui/badge'
import { Button } from '../ui/button'
import { Row, RowGroup } from '../ui/card'
import { Banner, LoadingRows, Spinner } from '../ui/states'
import { Switch } from '../ui/switch'
import { syncSummary, useSyncAction } from './actions'

const SECTION_OF: Record<BackupItemRef['category'], NavSection> = { skill: 'skills', mcp: 'mcp', provider: 'providers' }

export const STATE_TONE: Record<SyncState, BadgeTone> = {
  syncing: 'neutral',
  error: 'bad',
  blocked: 'bad',
  conflict: 'warn',
  pending: 'neutral',
  remote: 'neutral',
  synced: 'ok',
  never: 'dashed',
}

function Heading({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="mb-2 ml-0.5 flex items-baseline gap-2">
      <h2 className="text-xs font-semibold text-fg-3">{children}</h2>
      {extra}
    </div>
  )
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="-mt-1 mb-2 ml-0.5 max-w-[70ch] text-xs text-fg-3">{children}</p>
}

function Mono({ children }: { children: ReactNode }) {
  return <code className="break-all font-mono text-[11.5px] text-fg-2">{children}</code>
}

function fmt(template: string, ...values: (string | number)[]): string {
  return values.reduce<string>((s, v, i) => s.replace(`{${i}}`, String(v)), template)
}

function ItemTitle({ item }: { item: BackupItemRef }) {
  return (
    <>
      <CategoryIcon category={item.category} size="sm" />
      <span className="min-w-0 break-all">{item.slug}</span>
    </>
  )
}

function WhatGoesWhere() {
  const t = useT()
  const list = (icon: ReactNode, keys: string[]) => (
    <ul className="mb-4 flex flex-col gap-1.5 rounded-box border border-line bg-panel px-3.5 py-3 text-[12.5px] text-fg-2">
      {keys.map((k) => (
        <li key={k} className="flex gap-2">
          <span aria-hidden className="mt-[3px] flex-none [&_svg]:h-3.5 [&_svg]:w-3.5">
            {icon}
          </span>
          <span>{t(k)}</span>
        </li>
      ))}
    </ul>
  )
  return (
    <>
      <Heading>{t('bk.inT')}</Heading>
      {list(<Check className="text-provider" />, ['bk.inSkills', 'bk.inConfig', 'bk.inState'])}
      <Heading>{t('bk.outT')}</Heading>
      {list(<Ban className="text-fg-3" />, ['bk.outKeys', 'bk.outFiles', 'bk.outOwn', 'bk.outLocal', 'bk.outProjects'])}
      <p className="max-w-[70ch] text-xs text-fg-3">{t('bk.scan')}</p>
    </>
  )
}

function NotConnected() {
  const t = useT()
  const backup = useBackup()!
  return (
    <>
      <p className="mb-3 max-w-[70ch] text-fg-2">{t('bk.intro')}</p>
      <RowGroup className="mb-2">
        <Row title={t('bk.newT')} sub={t('bk.newD')}>
          <Button size="sm" variant="primary" onClick={() => backup.openDialog({ kind: 'connect', mode: 'new' })}>
            {t('bk.newBtn')}
          </Button>
        </Row>
        <Row title={t('bk.restoreT')} sub={t('bk.restoreD')}>
          <Button size="sm" onClick={() => backup.openDialog({ kind: 'connect', mode: 'restore' })}>
            <Download />
            {t('bk.restoreBtn')}
          </Button>
        </Row>
      </RowGroup>
      <p className="mb-5 ml-0.5 text-xs text-fg-3">{t('bk.noSignIn')}</p>
      <WhatGoesWhere />
    </>
  )
}

function pendingText(items: BackupItemRef[], t: (k: string) => string, locale: string): string {
  const names = items.map((i) => i.slug)
  const shown = names.length > 4 ? fmt(t('bk.pendingMore'), joinNames(names.slice(0, 3), locale), names.length - 3) : joinNames(names, locale)
  return fmt(t('bk.pendingList'), shown)
}

function StatusRows({ status }: { status: BackupStatus }) {
  const { t, locale } = useI18n()
  const backup = useBackup()!
  const runSync = useSyncAction()
  const { busy, autoRunning, autoEnabled, autoError } = backup
  const state = syncState(status, { running: autoRunning || busy === 'now' || busy === 'pull', error: !!autoError })
  const label = (mode: 'now' | 'pull') => (busy !== mode ? t(`bk.${mode}`) : autoRunning ? t('bk.waiting') : t(mode === 'now' ? 'bk.backingUp' : 'bk.pulling'))
  const sub = [status.lastSync ? fmt(t('bk.lastSync'), formatWhen(status.lastSync.at, locale)) : t('bk.never')]
  if (status.localChanges.length) sub.push(pendingText(status.localChanges, t, locale))
  if (status.remoteAhead) sub.push(t('bk.state.remote'))
  return (
    <RowGroup>
      <Row
        title={
          <>
            {t('bk.statusRow')}
            <Badge tone={STATE_TONE[state]} data-testid="backup-state">
              {state === 'syncing' && <Spinner className="h-2.5 w-2.5 border" />}
              {t(`bk.state.${state}`)}
            </Badge>
          </>
        }
        sub={sub.join(' · ')}
      >
        <Button size="sm" title={t('bk.pullTitle')} disabled={busy !== null} onClick={() => void runSync('pull')}>
          {busy === 'pull' ? <Spinner className="h-3.5 w-3.5" /> : <Download />}
          {label('pull')}
        </Button>
        <Button size="sm" variant="primary" title={t('bk.nowTitle')} disabled={busy !== null} onClick={() => void runSync('now')}>
          {busy === 'now' ? <Spinner className="h-3.5 w-3.5" /> : <Upload />}
          {label('now')}
        </Button>
      </Row>
      <Row title={t('bk.auto')} sub={status.lastSync ? t('bk.autoD') : `${t('bk.autoD')}${t('bk.autoAfterFirst')}`}>
        <Switch
          kind="provider"
          aria-label={t('bk.auto')}
          checked={autoEnabled === true}
          disabled={autoEnabled === null}
          onCheckedChange={backup.setAutoEnabled}
        />
      </Row>
      <Row
        title={t('bk.remoteRow')}
        sub={
          <>
            <Mono>{status.remote}</Mono> · {fmt(t('bk.branchOf'), status.branch ?? '')}
            {status.hasCredentials && <> · {t('bk.tokenStored')}</>}
          </>
        }
      >
        <Button size="sm" variant="danger" disabled={busy !== null} onClick={() => backup.openDialog({ kind: 'disconnect' })}>
          {t('bk.disconnect')}
        </Button>
      </Row>
      <Row
        title={t('bk.deviceRow')}
        sub={
          <>
            <Mono>{status.device}</Mono> · {t('bk.deviceRowD')}
          </>
        }
      />
    </RowGroup>
  )
}

function Notices({ status }: { status: BackupStatus }) {
  const { t, locale } = useI18n()
  const backup = useBackup()!
  const { opError, autoError, lastRun } = backup
  const out: ReactNode[] = []
  if (opError && opError.op !== 'connect') {
    const e = describeBackupError(opError.error, t)
    out.push(
      <Banner key="op" tone="error" title={t(`bk.failed.${opError.op}`)}>
        <p>{e.message}</p>
        <ErrorDetails detail={e.detail} />
      </Banner>
    )
  } else if (autoError) {
    const e = describeBackupError(autoError, t)
    out.push(
      <Banner key="auto" tone="warn" title={t('bk.autoFailed')}>
        <p>{e.message}</p>
        <p>{t('bk.autoFailedD')}</p>
        <ErrorDetails detail={e.detail} />
      </Banner>
    )
  } else if (lastRun) {
    const { mode, result, auto } = lastRun
    const applied = result.applied.map((a) => fmt(t('bk.appliedItem'), a.slug, joinNames(a.actions.map((x) => t(`bk.action.${x}`)), locale)))
    out.push(
      <Banner key="run" tone="info" title={`${auto ? `${t('bk.resultAuto')} · ` : ''}${syncSummary(mode, result, t)}`}>
        {applied.length > 0 && <p>{fmt(t('bk.applied'), joinNames(applied, locale))}</p>}
        <p>{fmt(t('bk.snapshotNote'), result.snapshot)}</p>
      </Banner>
    )
  }
  if (status.secretFindings.length) {
    out.push(
      <Banner key="secret" tone="error" title={t('bk.secretT')}>
        <p>{t('bk.secretD')}</p>
        <ul className="mt-1.5 flex flex-col gap-1" aria-label={t('bk.secretT')}>
          {status.secretFindings.map((f, i) => {
            const { item, path } = splitFindingPath(f.file)
            return (
              <li key={i} className="font-mono text-[11.5px] text-fg">
                {fmt(t('bk.secretRow'), item, path || f.file, describeFinding(f.what, t))}
              </li>
            )
          })}
        </ul>
      </Banner>
    )
  }
  if (!out.length) return null
  return <div className="mb-4 flex flex-col gap-2">{out}</div>
}

function Conflicts({ status }: { status: BackupStatus }) {
  const { t, locale } = useI18n()
  const backup = useBackup()!
  if (!status.conflicts.length) return null
  return (
    <section aria-label={t('bk.conflictsT')}>
      <Heading extra={<Badge tone="warn">{status.conflicts.length}</Badge>}>{t('bk.conflictsT')}</Heading>
      <Lead>{t('bk.conflictsD')}</Lead>
      <RowGroup>
        {status.conflicts.map((c) => (
          <Row
            key={c.key}
            title={<ItemTitle item={c} />}
            sub={`${t(`bk.reason.${c.reason}`).replace('{0}', c.remoteDevice ?? t('bk.otherDevice'))} · ${fmt(
              t('bk.partsLabel'),
              joinNames(c.parts.map((p) => t(`bk.parts.${p}`)), locale)
            )}`}
          >
            <Button size="sm" disabled={backup.busy !== null} onClick={() => backup.openDialog({ kind: 'conflict', conflict: c })}>
              {t('bk.resolve')}
            </Button>
          </Row>
        ))}
      </RowGroup>
    </section>
  )
}

function MissingKeys({ status }: { status: BackupStatus }) {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const { setSelectedSlug, setEditingConfigSlug } = useAppState()
  if (!status.missingSecrets.length) return null
  return (
    <section aria-label={t('bk.missingT')}>
      <Heading extra={<Badge tone="warn">{status.missingSecrets.length}</Badge>}>{t('bk.missingT')}</Heading>
      <Lead>{t('bk.missingD')}</Lead>
      <RowGroup>
        {status.missingSecrets.map((m) => (
          <Row
            key={`${m.key}:${m.reason}`}
            title={<ItemTitle item={m} />}
            sub={fmt(t(m.reason === 'no-key' ? 'bk.missingNoKey' : 'bk.missingConfig'), joinNames(m.targets.map((x) => TARGET_LABEL[x]), locale))}
          >
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                navigate(SECTION_OF[m.category])
                setEditingConfigSlug(null)
                setSelectedSlug(m.slug)
              }}
            >
              {t('bk.fill')}
            </Button>
          </Row>
        ))}
      </RowGroup>
    </section>
  )
}

function Failed({ status }: { status: BackupStatus }) {
  const t = useT()
  if (!status.failed.length) return null
  return (
    <section aria-label={t('bk.failedT')}>
      <Heading>{t('bk.failedT')}</Heading>
      <Lead>{t('bk.failedD')}</Lead>
      <RowGroup>
        {status.failed.map((f, i) => (
          <Row key={`${f.key}:${i}`} title={<ItemTitle item={f} />} sub={<span className="break-words">{f.message}</span>} />
        ))}
      </RowGroup>
    </section>
  )
}

const EXCLUDED_SHOWN = 6

function NotUploaded({ status }: { status: BackupStatus }) {
  const t = useT()
  const lines: string[] = [
    ...status.localOnly.map((l) => (l.bytes ? fmt(t('bk.tooLargeSize'), l.slug, Math.round(l.bytes / 1024 / 1024)) : fmt(t('bk.tooLarge'), l.slug))),
    ...status.notRestorable.map((n) => fmt(t('bk.notRestorable'), n.slug)),
    ...status.excludedFiles.slice(0, EXCLUDED_SHOWN).map((e) => fmt(t('bk.excluded'), e.slug, e.file, t(`bk.why.${e.reason}`))),
  ]
  const more = status.excludedFiles.length - EXCLUDED_SHOWN
  if (more > 0) lines.push(fmt(t('bk.excludedMore'), more))
  if (!lines.length) return null
  return (
    <section aria-label={t('bk.localT')}>
      <Heading>{t('bk.localT')}</Heading>
      <ul className="mb-4 flex flex-col gap-1 rounded-box border border-line px-3.5 py-2.5 text-[12.5px] text-fg-2">
        {lines.map((l, i) => (
          <li key={i} className="break-words">
            {l}
          </li>
        ))}
      </ul>
    </section>
  )
}

const SNAPSHOTS_SHOWN = 5

function useLockedList<T>(method: string, args: unknown[]): { list: T[] | null; error: unknown } {
  const backup = useBackup()!
  const [state, setState] = useState<{ list: T[] | null; error: unknown }>({ list: null, error: null })
  const key = JSON.stringify(args)
  useEffect(() => {
    let live = true
    backup.read<T[]>(method, JSON.parse(key) as unknown[]).then(
      (list) => live && setState({ list, error: null }),
      (error) => live && setState((s) => ({ list: s.list, error }))
    )
    return () => {
      live = false
    }
  }, [backup.read, backup.version, method, key])
  return state
}

function Snapshots() {
  const { t, locale } = useI18n()
  const backup = useBackup()!
  const { list, error } = useLockedList<BackupSnapshot>('listBackupSnapshots', [])
  const [all, setAll] = useState(false)
  let body: ReactNode
  if (!list && error) body = <Banner tone="error" title={t('bk.snapshotsFailed')}>{describeBackupError(error, t).message}</Banner>
  else if (!list) body = <LoadingRows rows={2} label={t('bk.snapshotsLoading')} />
  else if (!list.length) body = <p className="mb-4 rounded-box border border-dashed border-line-strong px-3.5 py-3 text-[12.5px] text-fg-3">{t('bk.snapshotsEmpty')}</p>
  else
    body = (
      <RowGroup>
        {(all ? list : list.slice(0, SNAPSHOTS_SHOWN)).map((s) => (
          <Row key={s.id} title={formatWhen(s.createdAt, locale)} sub={<>{snapshotLabel(s.reason, t)} · <Mono>{s.id}</Mono></>}>
            <Button size="sm" disabled={backup.busy !== null} onClick={() => backup.openDialog({ kind: 'restore', snapshot: s })}>
              {t('bk.restore')}
            </Button>
          </Row>
        ))}
        {!all && list.length > SNAPSHOTS_SHOWN && (
          <div className="px-3.5 py-2">
            <Button size="sm" variant="ghost" onClick={() => setAll(true)}>
              {fmt(t('bk.showAll'), list.length)}
            </Button>
          </div>
        )}
      </RowGroup>
    )
  return (
    <section aria-label={t('bk.snapshotsT')}>
      <Heading>{t('bk.snapshotsT')}</Heading>
      <Lead>{t('bk.snapshotsD')}</Lead>
      {body}
    </section>
  )
}

function History({ device }: { device?: string }) {
  const { t, locale } = useI18n()
  const { list, error } = useLockedList<BackupHistoryEntry>('listBackupHistory', [{ limit: 20 }])
  let body: ReactNode
  if (!list && error) body = <Banner tone="error" title={t('bk.historyFailed')}>{describeBackupError(error, t).message}</Banner>
  else if (!list) body = <LoadingRows rows={2} label={t('bk.historyLoading')} />
  else if (!list.length) body = <p className="mb-4 rounded-box border border-dashed border-line-strong px-3.5 py-3 text-[12.5px] text-fg-3">{t('bk.historyEmpty')}</p>
  else
    body = (
      <RowGroup>
        {list.map((e) => {
          const n = uploadedCount(e.subject)
          return (
            <Row
              key={e.commit}
              title={
                <>
                  {e.device}
                  {e.device === device && <Badge>{t('bk.thisDevice')}</Badge>}
                </>
              }
              sub={
                <>
                  {formatWhen(e.at, locale)} · {n === null ? e.subject : fmt(t('bk.historyUploaded'), n)} · <Mono>{e.commit.slice(0, 10)}</Mono>
                </>
              }
            />
          )
        })}
      </RowGroup>
    )
  return (
    <section aria-label={t('bk.historyT')}>
      <Heading>{t('bk.historyT')}</Heading>
      <Lead>{t('bk.historyD')}</Lead>
      {body}
    </section>
  )
}

function Connected({ status }: { status: BackupStatus }) {
  return (
    <>
      <StatusRows status={status} />
      <Notices status={status} />
      <Conflicts status={status} />
      <MissingKeys status={status} />
      <Failed status={status} />
      <NotUploaded status={status} />
      <Snapshots />
      <History device={status.device} />
    </>
  )
}

/** 设置 › 备份与同步. */
export function BackupTab() {
  const t = useT()
  const backup = useBackup()
  if (!backup) return null
  const { status, loadError } = backup
  if (!status) {
    if (loadError) {
      const e = describeBackupError(loadError, t)
      return (
        <Banner
          tone="error"
          title={t('bk.loadFailed')}
          actions={
            <Button size="sm" onClick={() => void backup.refresh()}>
              {t('bk.retry')}
            </Button>
          }
        >
          <p>{e.message}</p>
          <ErrorDetails detail={e.detail} />
        </Banner>
      )
    }
    return <LoadingRows rows={3} label={t('bk.loading')} />
  }
  return status.connected ? <Connected status={status} /> : <NotConnected />
}

