import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { BackupConflict, BackupConflictChoice, BackupConnectResult, BackupSnapshot } from '@as/types'
import { useI18n, useT } from '../../i18n'
import { errorText } from '../../lib/rpc'
import { describeBackupError, deviceSlug, formatWhen, isHttpsRemote, redactRemote, snapshotLabel } from '../../lib/backup'
import type { FriendlyError } from '../../lib/errors'
import { useBackup } from '../../state/Backup'
import { useTerminalLog } from '../../state/TerminalLog'
import { ErrorDetails, Section, Steps } from '../library/parts'
import { SecretInput } from '../library/McpPane'
import { Button } from '../ui/button'
import { cn } from '../ui/cn'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { Banner } from '../ui/states'
import { toast } from '../ui/toast'
import { useSyncAction } from './actions'

function fmt(template: string, ...values: (string | number)[]): string {
  return values.reduce<string>((s, v, i) => s.replace(`{${i}}`, String(v)), template)
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="mb-[5px] block text-[12.5px] font-semibold text-fg-2">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11.5px] text-fg-3">{hint}</p>}
    </div>
  )
}

function Failure({ title, error }: { title: string; error: FriendlyError }) {
  return (
    <div className="mt-3">
      <Banner tone="error" title={title}>
        <p>{error.message}</p>
        <ErrorDetails detail={error.detail} />
      </Banner>
    </div>
  )
}

function ConnectBody({ mode, onClose }: { mode: 'new' | 'restore'; onClose: () => void }) {
  const t = useT()
  const backup = useBackup()!
  const runSync = useSyncAction()
  const { appendLine } = useTerminalLog()
  const [remote, setRemote] = useState('')
  const [branch, setBranch] = useState('')
  const [device, setDevice] = useState('')
  const [username, setUsername] = useState('')
  const [token, setToken] = useState('')
  const [invalid, setInvalid] = useState<string | null>(null)
  const [error, setError] = useState<FriendlyError | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<BackupConnectResult | null>(null)
  const primary = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (done) primary.current?.focus()
  }, [done])

  async function submit() {
    const url = remote.trim()
    if (!url) return setInvalid(t('bk.remoteRequired'))
    if (token && !isHttpsRemote(url)) return setInvalid(t('bk.tokenNeedsHttps'))
    setInvalid(null)
    setError(null)
    setBusy(true)
    const flags = [branch.trim() && `--branch ${branch.trim()}`, device.trim() && `--device ${device.trim()}`, username.trim() && `--username ${username.trim()}`, token && '--token-stdin']
    appendLine(`$ aas backup connect ${redactRemote(url)}${flags.filter(Boolean).map((f) => ` ${f}`).join('')}`)
    try {
      const r = await backup.connect({
        remote: url,
        ...(branch.trim() ? { branch: branch.trim() } : {}),
        ...(device.trim() ? { device: device.trim() } : {}),
        ...(username.trim() ? { username: username.trim() } : {}),
        ...(token ? { token } : {}),
      })
      setToken('')
      appendLine(`✓ ${fmt(t('bk.connectedTo'), r.status.remote ?? '', r.status.branch ?? '', r.status.device ?? '')}`, 'green')
      setDone(r)
    } catch (err) {
      appendLine(`✗ ${errorText(err)}`, 'red')
      setError(describeBackupError(err, t))
    } finally {
      setBusy(false)
    }
  }

  function next(mode: 'now' | 'pull') {
    onClose()
    void runSync(mode)
  }

  if (done) {
    const s = done.status
    const items = done.remoteItems
    return (
      <>
        <DialogBody>
          <DialogTitle>{t('bk.connectedT')}</DialogTitle>
          <p className="mb-3 text-[13px] text-fg-2">{fmt(t('bk.connectedTo'), s.remote ?? '', s.branch ?? '', s.device ?? '')}</p>
          {items === 0 ? (
            <p className="text-[13px] text-fg-2">{t('bk.connectedEmpty')}</p>
          ) : (
            <>
              <p className="mb-2 text-[13px] text-fg">{fmt(t('bk.connectedItems'), items)}</p>
              <dl className="flex flex-col gap-2 text-[12.5px]">
                <div>
                  <dt className="font-semibold text-fg">{t('bk.pullChoice')}</dt>
                  <dd className="text-fg-2">{t('bk.pullChoiceD')}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-fg">{t('bk.mergeChoice')}</dt>
                  <dd className="text-fg-2">{t('bk.mergeChoiceD')}</dd>
                </div>
              </dl>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>{t('bk.later')}</Button>
          {items === 0 ? (
            <Button ref={primary} variant="primary" onClick={() => next('now')}>
              {t('bk.now')}
            </Button>
          ) : mode === 'restore' ? (
            <>
              <Button onClick={() => next('now')}>{t('bk.mergeChoice')}</Button>
              <Button ref={primary} variant="primary" onClick={() => next('pull')}>
                {t('bk.pullChoice')}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => next('pull')}>{t('bk.pullChoice')}</Button>
              <Button ref={primary} variant="primary" onClick={() => next('now')}>
                {t('bk.mergeChoice')}
              </Button>
            </>
          )}
        </DialogFooter>
      </>
    )
  }

  return (
    <>
      <DialogBody>
        <form
          id="backup-connect-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!busy) void submit()
          }}
        >
          <DialogTitle>{t(mode === 'restore' ? 'bk.connectRestoreT' : 'bk.connectT')}</DialogTitle>
          <p className="mb-3.5 text-[13px] text-fg-2">{t('bk.connectD')}</p>
          <Field id="backup-remote" label={t('bk.remote')}>
            <Input
              id="backup-remote"
              data-autofocus
              mono
              autoComplete="off"
              spellCheck={false}
              value={remote}
              invalid={invalid === t('bk.remoteRequired')}
              placeholder={t('bk.remotePh')}
              onChange={(e) => setRemote(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-x-3">
            <Field id="backup-branch" label={t('bk.branch')}>
              <Input id="backup-branch" mono autoComplete="off" spellCheck={false} value={branch} placeholder={t('bk.branchPh')} onChange={(e) => setBranch(e.target.value)} />
            </Field>
            <Field id="backup-device" label={t('bk.device')}>
              <Input id="backup-device" autoComplete="off" spellCheck={false} value={device} placeholder={t('bk.devicePh')} onChange={(e) => setDevice(e.target.value)} />
            </Field>
          </div>
          <p className="-mt-1.5 mb-3.5 text-[11.5px] text-fg-3">{t('bk.deviceHint')}</p>
          <Section title={t('bk.httpsT')} className="mt-1">
            <div className="grid grid-cols-2 gap-x-3">
              <Field id="backup-username" label={t('bk.username')}>
                <Input id="backup-username" autoComplete="off" spellCheck={false} value={username} placeholder={t('bk.usernamePh')} onChange={(e) => setUsername(e.target.value)} />
              </Field>
              <Field id="backup-token" label={t('bk.token')}>
                <SecretInput id="backup-token" secret value={token} placeholder={t('bk.tokenPh')} onChange={setToken} />
              </Field>
            </div>
            <p className="text-[11.5px] text-fg-3">{t('bk.tokenHint')}</p>
          </Section>
          <p className="mt-3 text-[12px] text-fg-3">{t('bk.noSyncYet')}</p>
          {invalid && (
            <p role="alert" className="mt-2 text-[12.5px] text-bad">
              {invalid}
            </p>
          )}
          {error && <Failure title={t('bk.failed.connect')} error={error} />}
        </form>
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" type="submit" form="backup-connect-form" disabled={busy}>
          {busy ? t('bk.connecting') : t('bk.connect')}
        </Button>
      </DialogFooter>
    </>
  )
}

function ConflictBody({ conflict, onClose }: { conflict: BackupConflict; onClose: () => void }) {
  const t = useT()
  const backup = useBackup()!
  const { appendLine } = useTerminalLog()
  const [choice, setChoice] = useState<BackupConflictChoice | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<FriendlyError | null>(null)
  const other = conflict.remoteDevice ?? t('bk.otherDevice')
  const remoteD =
    conflict.reason === 'deleted-there'
      ? `${t('bk.choice.remoteD')}${t('bk.choice.remoteGone')}`
      : conflict.reason === 'deleted-here'
        ? `${t('bk.choice.remoteD')}${t('bk.choice.remoteBack')}`
        : t('bk.choice.remoteD')
  const options: { id: BackupConflictChoice; title: string; desc: string }[] = [
    { id: 'local', title: t('bk.choice.local'), desc: t('bk.choice.localD') },
    { id: 'remote', title: t('bk.choice.remote'), desc: remoteD },
  ]
  // The core keeps both only when both sides still have the item.
  if (conflict.reason === 'both-changed') {
    options.push({ id: 'both', title: t('bk.choice.both'), desc: fmt(t('bk.choice.bothD'), `${conflict.slug}-${deviceSlug(conflict.remoteDevice)}`) })
  }

  async function confirm() {
    if (!choice) return
    setBusy(true)
    setError(null)
    appendLine(`$ aas backup resolve ${conflict.key} ${choice}`)
    try {
      const r = await backup.resolve(conflict.key, choice)
      const msg = fmt(t('bk.resolved'), conflict.slug)
      appendLine(`✓ ${msg}`, 'green')
      toast(r.keptAs ? `${msg} ${fmt(t('bk.keptAs'), r.keptAs)}` : msg)
      onClose()
    } catch (err) {
      appendLine(`✗ ${errorText(err)}`, 'red')
      setError(describeBackupError(err, t))
      setBusy(false)
    }
  }

  return (
    <>
      <DialogBody>
        <DialogTitle>{fmt(t('bk.resolveT'), conflict.slug)}</DialogTitle>
        <p className="mb-3 text-[13px] text-fg-2">
          {t(`bk.reason.${conflict.reason}`).replace('{0}', other)} · {fmt(t('bk.partsLabel'), conflict.parts.map((p) => t(`bk.parts.${p}`)).join(' / '))}
        </p>
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{fmt(t('bk.resolveT'), conflict.slug)}</legend>
          {options.map((o) => (
            <label
              key={o.id}
              className={cn(
                'flex cursor-pointer gap-2.5 rounded-box border px-3 py-2.5 transition-colors',
                choice === o.id ? 'border-mcp/60 bg-panel-2' : 'border-line hover:bg-panel'
              )}
            >
              <input
                type="radio"
                name="backup-choice"
                value={o.id}
                checked={choice === o.id}
                onChange={() => setChoice(o.id)}
                className="mt-[3px] h-3.5 w-3.5 flex-none accent-[rgb(var(--mcp-rgb))]"
              />
              <span className="min-w-0">
                <b className="block text-[13px] font-semibold text-fg">{o.title}</b>
                <small className="block text-xs text-fg-3">{o.desc}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="mt-3 text-[12px] text-fg-3">{t('bk.resolveSnap')}</p>
        {error && <Failure title={t('bk.failed.resolve')} error={error} />}
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" disabled={busy || !choice} onClick={() => void confirm()}>
          {t('bk.confirm')}
        </Button>
      </DialogFooter>
    </>
  )
}

function RestoreBody({ snapshot, onClose }: { snapshot: BackupSnapshot; onClose: () => void }) {
  const { t, locale } = useI18n()
  const backup = useBackup()!
  const { appendLine } = useTerminalLog()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<FriendlyError | null>(null)
  const when = formatWhen(snapshot.createdAt, locale)

  async function restore() {
    setBusy(true)
    setError(null)
    appendLine(`$ aas backup restore ${snapshot.id}`)
    try {
      await backup.restore(snapshot.id)
      const msg = fmt(t('bk.restored'), when)
      appendLine(`✓ ${msg}`, 'green')
      toast(msg)
      onClose()
    } catch (err) {
      appendLine(`✗ ${errorText(err)}`, 'red')
      setError(describeBackupError(err, t))
      setBusy(false)
    }
  }

  return (
    <>
      <DialogBody>
        <DialogTitle>{t('bk.snapRestoreT')}</DialogTitle>
        <p className="mb-1 text-[13px] text-fg-2">
          {when} · {snapshotLabel(snapshot.reason, t)} · <code className="font-mono text-[11.5px]">{snapshot.id}</code>
        </p>
        <Steps className="mt-3" lines={[t('bk.restoreWill'), t('bk.restoreSnap'), t('bk.restoreUpload')]} />
        {error && <Failure title={t('bk.failed.restore')} error={error} />}
      </DialogBody>
      <DialogFooter>
        <Button data-autofocus onClick={onClose} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => void restore()}>
          {t('bk.snapRestoreBtn')}
        </Button>
      </DialogFooter>
    </>
  )
}

function DisconnectBody({ onClose }: { onClose: () => void }) {
  const t = useT()
  const backup = useBackup()!
  const { appendLine } = useTerminalLog()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<FriendlyError | null>(null)

  async function disconnect() {
    setBusy(true)
    setError(null)
    appendLine('$ aas backup disconnect')
    try {
      await backup.disconnect()
      appendLine(`✓ ${t('bk.disconnected')}`, 'green')
      toast(t('bk.disconnected'))
      onClose()
    } catch (err) {
      appendLine(`✗ ${errorText(err)}`, 'red')
      setError(describeBackupError(err, t))
      setBusy(false)
    }
  }

  return (
    <>
      <DialogBody>
        <DialogTitle>{t('bk.discT')}</DialogTitle>
        <Section title={t('bk.discWill')} className="mt-3">
          <Steps lines={[t('bk.discWillD')]} />
        </Section>
        <Section title={t('bk.discWont')} className="mt-3">
          <Steps lines={[t('bk.discWontRemote'), t('bk.discWontLocal')]} />
        </Section>
        <p className="mt-3 text-[12px] text-fg-3">{t('bk.discAgain')}</p>
        {error && <Failure title={t('bk.failed.disconnect')} error={error} />}
      </DialogBody>
      <DialogFooter>
        <Button data-autofocus onClick={onClose} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => void disconnect()}>
          {t('bk.discBtn')}
        </Button>
      </DialogFooter>
    </>
  )
}

/** Connect, resolve a conflict, restore a snapshot and disconnect: opened from the backup page and the command palette. */
export function BackupDialogs() {
  const backup = useBackup()
  const contentRef = useRef<HTMLDivElement>(null)
  if (!backup) return null
  const { dialog, openDialog } = backup
  const close = () => openDialog(null)
  return (
    <Dialog open={dialog !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent
        ref={contentRef}
        width={dialog?.kind === 'connect' ? 'wide' : 'md'}
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => {
          const target = contentRef.current?.querySelector<HTMLElement>('[data-autofocus]')
          if (target) {
            e.preventDefault()
            target.focus()
          }
        }}
      >
        {dialog?.kind === 'connect' && <ConnectBody mode={dialog.mode} onClose={close} />}
        {dialog?.kind === 'conflict' && <ConflictBody key={dialog.conflict.key} conflict={dialog.conflict} onClose={close} />}
        {dialog?.kind === 'restore' && <RestoreBody key={dialog.snapshot.id} snapshot={dialog.snapshot} onClose={close} />}
        {dialog?.kind === 'disconnect' && <DisconnectBody onClose={close} />}
      </DialogContent>
    </Dialog>
  )
}
