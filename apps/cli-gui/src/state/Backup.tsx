import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type {
  BackupConflict, BackupConflictChoice, BackupConnectOptions, BackupConnectResult, BackupResolveResult, BackupRestoreResult,
  BackupSnapshot, BackupStatus, BackupSyncResult,
} from '@as/types'
import { callRpc, watchRpc } from '../lib/rpc'
import { AUTO_TIMING, BACKED_UP_METHODS, autoDue, isBusyError, type AutoTiming } from '../lib/backup'
import { readLocalState, writeLocalState } from './LocalPersistence'
import { useAppState } from './AppState'

export type BackupOp = 'connect' | 'now' | 'pull' | 'resolve' | 'restore' | 'disconnect'

export type BackupDialog =
  | { kind: 'connect'; mode: 'new' | 'restore' }
  | { kind: 'conflict'; conflict: BackupConflict }
  | { kind: 'restore'; snapshot: BackupSnapshot }
  | { kind: 'disconnect' }

export interface LastRun {
  mode: 'now' | 'pull'
  auto: boolean
  result: BackupSyncResult
}

interface BackupValue {
  /** null until the first getBackupStatus answers. */
  status: BackupStatus | null
  loadError: unknown
  /** The operation the user started; it may still be waiting for auto-sync to finish. */
  busy: BackupOp | null
  autoRunning: boolean
  /** null until the saved choice is read. */
  autoEnabled: boolean | null
  setAutoEnabled: (v: boolean) => void
  /** The last automatic run's failure; cleared by the next successful sync. */
  autoError: unknown
  lastRun: LastRun | null
  /** The last operation the user started that failed; cleared when the next one starts. */
  opError: { op: BackupOp; error: unknown } | null
  /** A read that takes the backup lock (snapshots, history), queued with the rest. */
  read: <T>(method: string, args?: unknown[]) => Promise<T>
  /** Bumped after every operation, so the snapshot and history lists reload. */
  version: number
  refresh: () => Promise<void>
  connect: (options: BackupConnectOptions) => Promise<BackupConnectResult>
  sync: (mode: 'now' | 'pull') => Promise<BackupSyncResult>
  resolve: (item: string, choice: BackupConflictChoice) => Promise<BackupResolveResult>
  restore: (id: string) => Promise<BackupRestoreResult>
  disconnect: () => Promise<void>
  dialog: BackupDialog | null
  openDialog: (d: BackupDialog | null) => void
}

const BackupContext = createContext<BackupValue | null>(null)

const STATE_KEY = 'backup'
const STATUS_AFTER_CHANGE_MS = 3_000

export function BackupProvider({ children, timing = AUTO_TIMING }: { children: ReactNode; timing?: AutoTiming }) {
  const { bumpInstalledVersion } = useAppState()
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [busy, setBusy] = useState<BackupOp | null>(null)
  const [autoRunning, setAutoRunning] = useState(false)
  const [autoEnabled, setAutoEnabledState] = useState<boolean | null>(null)
  const [autoError, setAutoError] = useState<unknown>(null)
  const [lastRun, setLastRun] = useState<LastRun | null>(null)
  const [opError, setOpError] = useState<{ op: BackupOp; error: unknown } | null>(null)
  const [version, setVersion] = useState(0)
  const [dialog, openDialog] = useState<BackupDialog | null>(null)

  // Every backup RPC takes ~/.agent-store/backup.lock, which gives up after about 2.5 s,
  // so they run one at a time from here instead of racing for it.
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  const queued = useRef(0)
  const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    queued.current++
    const run = chain.current.then(fn, fn)
    chain.current = run.then(
      () => undefined,
      () => undefined
    )
    return run.finally(() => {
      queued.current--
    })
  }, [])

  const read = useCallback(<T,>(method: string, args: unknown[] = []) => enqueue(() => callRpc<T>(method, args)), [enqueue])

  const refresh = useCallback(async () => {
    try {
      setStatus(await enqueue(() => callRpc<BackupStatus>('getBackupStatus')))
      setLoadError(null)
    } catch (err) {
      setLoadError(err)
    }
  }, [enqueue])

  useEffect(() => {
    void refresh()
    readLocalState<{ auto?: boolean }>(STATE_KEY, {}).then(
      (s) => setAutoEnabledState(s.auto !== false),
      () => setAutoEnabledState(true)
    )
  }, [refresh])

  const setAutoEnabled = useCallback((v: boolean) => {
    setAutoEnabledState(v)
    writeLocalState(STATE_KEY, { auto: v }).catch(() => undefined)
  }, [])

  const connectedRef = useRef(false)
  connectedRef.current = !!status?.connected

  // Local changes made through the app: counted while they run, marked dirty when they end.
  const inFlight = useRef(0)
  const dirty = useRef(false)
  const lastChangeAt = useRef(0)
  const lastCheckAt = useRef(Date.now() - timing.remoteCheckMs + timing.initialDelayMs)
  const failures = useRef(0)
  const autoBusy = useRef(false)
  useEffect(() => {
    let statusTimer: ReturnType<typeof setTimeout> | undefined
    const stop = watchRpc((method, phase) => {
      if (!BACKED_UP_METHODS.has(method)) return
      if (phase === 'start') {
        inFlight.current++
        return
      }
      inFlight.current = Math.max(0, inFlight.current - 1)
      dirty.current = true
      lastChangeAt.current = Date.now()
      if (!connectedRef.current) return
      clearTimeout(statusTimer)
      statusTimer = setTimeout(() => {
        if (inFlight.current === 0) void refresh()
      }, STATUS_AFTER_CHANGE_MS)
    })
    return () => {
      stop()
      clearTimeout(statusTimer)
    }
  }, [refresh])

  const finishSync = useCallback(
    (mode: 'now' | 'pull', auto: boolean, result: BackupSyncResult) => {
      failures.current = 0
      setAutoError(null)
      setLastRun({ mode, auto, result })
      if (result.applied.length) bumpInstalledVersion()
    },
    [bumpInstalledVersion]
  )

  const manual = useCallback(
    async <T,>(op: BackupOp, fn: () => Promise<T>, after?: (r: T) => void): Promise<T> => {
      setBusy(op)
      setOpError(null)
      try {
        const r = await enqueue(fn)
        after?.(r)
        return r
      } catch (error) {
        setOpError({ op, error })
        throw error
      } finally {
        setBusy(null)
        setVersion((v) => v + 1)
        await refresh()
      }
    },
    [enqueue, refresh]
  )

  const connect = useCallback(
    (options: BackupConnectOptions) => manual('connect', () => callRpc<BackupConnectResult>('connectBackup', [options])),
    [manual]
  )
  const sync = useCallback(
    (mode: 'now' | 'pull') =>
      manual(mode, () => callRpc<BackupSyncResult>(mode === 'now' ? 'backupNow' : 'pullBackup'), (r) => {
        if (mode === 'now') dirty.current = false
        lastCheckAt.current = Date.now()
        finishSync(mode, false, r)
      }),
    [manual, finishSync]
  )
  const resolve = useCallback(
    (item: string, choice: BackupConflictChoice) =>
      manual('resolve', () => callRpc<BackupResolveResult>('resolveBackupConflict', [item, choice]), (r) => {
        if (r.applied.length) bumpInstalledVersion()
      }),
    [manual, bumpInstalledVersion]
  )
  const restore = useCallback(
    (id: string) =>
      manual('restore', () => callRpc<BackupRestoreResult>('restoreBackupSnapshot', [id]), (r) => {
        if (r.applied.length) bumpInstalledVersion()
      }),
    [manual, bumpInstalledVersion]
  )
  const disconnect = useCallback(
    () =>
      manual('disconnect', () => callRpc<void>('disconnectBackup'), () => {
        setLastRun(null)
        setAutoError(null)
      }),
    [manual]
  )

  const runAuto = useCallback(
    async (due: 'now' | 'check') => {
      autoBusy.current = true
      setAutoRunning(true)
      try {
        let mode: 'now' | 'pull' | null = due === 'now' ? 'now' : null
        if (due === 'now') dirty.current = false
        lastCheckAt.current = Date.now()
        if (!mode) {
          const s = await enqueue(() => callRpc<BackupStatus>('getBackupStatus', [{ fetch: true }]))
          setStatus(s)
          if (s.localChanges.length) mode = 'now'
          else if (s.remoteAhead) mode = 'pull'
        }
        if (mode) {
          const m = mode
          const r = await enqueue(() => callRpc<BackupSyncResult>(m === 'now' ? 'backupNow' : 'pullBackup'))
          finishSync(m, true, r)
          setVersion((v) => v + 1)
        } else {
          failures.current = 0
          setAutoError(null)
        }
      } catch (err) {
        if (due === 'now') dirty.current = true
        // Someone else (aas backup in a terminal) holds the lock: try again on the next tick.
        if (!isBusyError(err)) {
          failures.current++
          setAutoError(err)
        }
      } finally {
        autoBusy.current = false
        setAutoRunning(false)
        await refresh()
      }
    },
    [enqueue, finishSync, refresh]
  )

  const autoOn = !!status?.connected && !!status.lastSync && autoEnabled === true
  useEffect(() => {
    if (!autoOn) return
    const id = setInterval(() => {
      if (autoBusy.current || queued.current > 0 || inFlight.current > 0) return
      const due = autoDue(
        { dirty: dirty.current, lastChangeAt: lastChangeAt.current, lastCheckAt: lastCheckAt.current, failures: failures.current, now: Date.now() },
        timing
      )
      if (due) void runAuto(due)
    }, timing.pollMs)
    return () => clearInterval(id)
  }, [autoOn, timing, runAuto])

  return (
    <BackupContext.Provider
      value={{
        status, loadError, busy, autoRunning, autoEnabled, setAutoEnabled, autoError, lastRun, opError, read, version,
        refresh, connect, sync, resolve, restore, disconnect, dialog, openDialog,
      }}
    >
      {children}
    </BackupContext.Provider>
  )
}

export function useBackup(): BackupValue | null {
  return useContext(BackupContext)
}
