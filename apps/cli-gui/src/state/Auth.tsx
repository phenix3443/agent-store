import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { AccessToken, DeviceAuthorization, DevicePoll, Entitlements } from '@as/types'
import { openExternal } from '../lib/openExternal'
import { emailFromJwt, userIdFromJwt } from '../lib/storeAuth'
import { callRpc, RpcError } from '../lib/rpc'
import { deleteCredential, readCredential, writeCredential, type CredentialWrite } from '../lib/credentials'
import { focusMainWindow } from '../lib/focusWindow'
import { useEntitlement } from './Entitlement'

export type AuthProviderName = 'github' | 'google'

/**
 * A sign-in waiting for the browser (device authorization grant, #195).
 * `starting`: asking the store for a code; `waiting`: the code is shown and polled;
 * the rest are where a sign-in stops without signing in.
 */
export interface PendingSignIn {
  provider: AuthProviderName
  state: 'starting' | 'waiting' | 'timedOut' | 'denied' | 'failed'
  userCode: string | null
  url: string | null
  /** Epoch ms. */
  expiresAt: number | null
}

/** `expired`: the server no longer accepts the stored session. `notSaved`: no OS credential store, so this sign-in lasts until the app quits. */
export type AuthNotice = 'expired' | 'notSaved'

interface Session {
  sessionToken: string
  accessToken: string | null
  /** Unix seconds of `accessToken`. */
  expiresAt: number | null
  email: string | null
  userId: string | null
  persisted: boolean
  /** Epoch ms of the last failed refresh; schedules the next try. */
  failedAt: number | null
}

interface AuthValue {
  email: string | null
  /** The account id; null while signed out or before the first token arrives. */
  userId: string | null
  signedIn: boolean
  /** True until the stored session has been read at start. */
  restoring: boolean
  /** The current API token, possibly expired; call getAccessToken() before using it. */
  accessToken: string | null
  /** False when this sign-in could not be stored in the OS credential store. */
  persisted: boolean
  /** Whether sign-in is available (always true — the store handles auth). */
  configured: boolean
  pending: PendingSignIn | null
  notice: AuthNotice | null
  dismissNotice: () => void
  signIn: (provider: AuthProviderName) => Promise<void>
  /** Opens the approval page in the browser again. */
  reopenSignIn: () => Promise<void>
  cancelSignIn: () => void
  signOut: () => Promise<void>
  /** A token valid for at least half a minute, refreshed when needed; null when signed out or offline. */
  getAccessToken: (force?: boolean) => Promise<string | null>
}

const SESSION = 'store-session'
const REVOKE = 'store-session-revoke'
const REFRESH_EARLY_MS = 60_000
const MIN_VALID_MS = 30_000
const RETRY_MS = 60_000
const SLOW_DOWN_MS = 5_000

const AuthContext = createContext<AuthValue | null>(null)

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function isSessionExpired(err: unknown): boolean {
  return err instanceof RpcError && err.code === 'SessionExpiredError'
}

/** The store's approval page, with the provider the user picked. Only http(s) is opened. */
export function approvalUrl(raw: string, provider: AuthProviderName): string | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    url.searchParams.set('provider', provider)
    return url.toString()
  } catch {
    return null
  }
}

async function safely(write: Promise<CredentialWrite>): Promise<boolean> {
  try {
    return (await write).status === 'done'
  } catch {
    return false
  }
}

function withToken(base: Omit<Session, 'accessToken' | 'expiresAt' | 'email' | 'userId' | 'failedAt'>, token: AccessToken): Session {
  return {
    ...base,
    accessToken: token.token,
    expiresAt: token.expiresAt,
    email: emailFromJwt(token.token),
    userId: userIdFromJwt(token.token),
    failedAt: null,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { refresh: refreshEntitlements } = useEntitlement()
  const [session, setSessionState] = useState<Session | null>(null)
  const [restoring, setRestoring] = useState(true)
  const [pending, setPending] = useState<PendingSignIn | null>(null)
  const [notice, setNotice] = useState<AuthNotice | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const flow = useRef(0)
  const inflight = useRef<Promise<string | null> | null>(null)

  function setSession(next: Session | null) {
    sessionRef.current = next
    setSessionState(next)
  }

  // Failures leave the last-known cached plan untouched.
  async function syncPlan(token: string | null) {
    try {
      if (token) await callRpc<Entitlements>('syncEntitlement', [token])
      else await callRpc<Entitlements>('clearEntitlement')
    } catch {
      // keep cached plan
    }
    refreshEntitlements()
  }

  async function expire() {
    setSession(null)
    setNotice('expired')
    await safely(deleteCredential(SESSION))
    await syncPlan(null)
  }

  function refresh(): Promise<string | null> {
    if (inflight.current) return inflight.current
    const current = sessionRef.current
    if (!current) return Promise.resolve(null)
    const run = (async () => {
      try {
        const token = await callRpc<AccessToken>('getAccessToken', [current.sessionToken])
        if (sessionRef.current?.sessionToken !== current.sessionToken) return null
        const first = !current.accessToken
        setSession(withToken(current, token))
        if (first) void syncPlan(token.token)
        return token.token
      } catch (err) {
        const now = sessionRef.current
        if (!now || now.sessionToken !== current.sessionToken) return null
        if (isSessionExpired(err)) await expire()
        else setSession({ ...now, failedAt: Date.now() })
        return null
      } finally {
        inflight.current = null
      }
    })()
    inflight.current = run
    return run
  }

  async function getAccessToken(force = false): Promise<string | null> {
    const current = sessionRef.current
    if (!current) return null
    const valid = current.accessToken && current.expiresAt != null && current.expiresAt * 1000 - Date.now() > MIN_VALID_MS
    if (valid && !force) return current.accessToken
    return refresh()
  }

  useEffect(() => {
    if (!session) return
    let delay: number
    if (session.failedAt != null) delay = session.failedAt + RETRY_MS - Date.now()
    else if (session.accessToken && session.expiresAt != null) delay = session.expiresAt * 1000 - REFRESH_EARLY_MS - Date.now()
    else return
    const timer = setTimeout(() => void refresh(), Math.max(delay, 0))
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  async function revokeLeftover() {
    const left = await readCredential(REVOKE).catch(() => null)
    if (left?.status !== 'found') return
    try {
      await callRpc('signOutSession', [left.secret])
      await safely(deleteCredential(REVOKE))
    } catch {
      // still offline: try again next start
    }
  }

  useEffect(() => {
    let active = true
    void revokeLeftover()
    void (async () => {
      const stored = await readCredential(SESSION).catch(() => null)
      if (!active) return
      if (stored?.status === 'found') {
        const base = { sessionToken: stored.secret, persisted: true }
        try {
          const token = await callRpc<AccessToken>('getAccessToken', [stored.secret])
          if (!active) return
          setSession(withToken(base, token))
          void syncPlan(token.token)
        } catch (err) {
          if (!active) return
          if (isSessionExpired(err)) await expire()
          else setSession({ ...base, accessToken: null, expiresAt: null, email: null, userId: null, failedAt: Date.now() })
        }
      }
      if (active) setRestoring(false)
    })()
    return () => {
      active = false
      flow.current++
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function finishSignIn(sessionToken: string) {
    const previous = sessionRef.current
    const persisted = await safely(writeCredential(SESSION, sessionToken))
    const base = { sessionToken, persisted }
    let token: AccessToken | null = null
    try {
      token = await callRpc<AccessToken>('getAccessToken', [sessionToken])
    } catch {
      // the session is new; a failed exchange is retried by the refresh timer
    }
    setSession(token ? withToken(base, token) : { ...base, accessToken: null, expiresAt: null, email: null, userId: null, failedAt: Date.now() })
    setNotice(persisted ? null : 'notSaved')
    if (previous && previous.sessionToken !== sessionToken) void callRpc('signOutSession', [previous.sessionToken]).catch(() => undefined)
    if (token) await syncPlan(token.token)
    void focusMainWindow()
  }

  async function signIn(provider: AuthProviderName) {
    const id = ++flow.current
    const alive = () => flow.current === id
    const stop = (state: PendingSignIn['state']) => alive() && setPending((p) => (p ? { ...p, state } : p))
    setPending({ provider, state: 'starting', userCode: null, url: null, expiresAt: null })

    let auth: DeviceAuthorization
    try {
      auth = await callRpc<DeviceAuthorization>('startSignIn')
    } catch {
      stop('failed')
      return
    }
    if (!alive()) return
    const url = approvalUrl(auth.verificationUriComplete, provider)
    if (!url) {
      stop('failed')
      return
    }
    const expiresAt = Date.now() + auth.expiresIn * 1000
    setPending({ provider, state: 'waiting', userCode: auth.userCode, url, expiresAt })
    await openExternal(url).catch(() => undefined)

    let interval = auth.interval * 1000
    while (alive()) {
      await sleep(interval)
      if (!alive()) return
      if (Date.now() >= expiresAt) {
        stop('timedOut')
        return
      }
      let poll: DevicePoll
      try {
        poll = await callRpc<DevicePoll>('pollSignIn', [auth.deviceCode])
      } catch {
        continue
      }
      if (!alive()) return
      if (poll.status === 'pending') continue
      if (poll.status === 'slow_down') {
        interval += SLOW_DOWN_MS
        continue
      }
      if (poll.status === 'denied') {
        stop('denied')
        return
      }
      if (poll.status === 'expired') {
        stop('timedOut')
        return
      }
      await finishSignIn(poll.sessionToken)
      if (alive()) {
        flow.current++
        setPending(null)
      }
      return
    }
  }

  async function reopenSignIn() {
    if (pending?.url) await openExternal(pending.url).catch(() => undefined)
  }

  function cancelSignIn() {
    flow.current++
    setPending(null)
  }

  async function signOut() {
    flow.current++
    setPending(null)
    setNotice(null)
    const current = sessionRef.current
    setSession(null)
    if (current) {
      await safely(deleteCredential(SESSION))
      try {
        await callRpc('signOutSession', [current.sessionToken])
      } catch {
        // offline: the server session ends on the next start, or by itself when it expires
        await safely(writeCredential(REVOKE, current.sessionToken))
      }
    }
    await syncPlan(null)
  }

  return (
    <AuthContext.Provider
      value={{
        email: session?.email ?? null,
        userId: session?.userId ?? null,
        signedIn: session != null,
        restoring,
        accessToken: session?.accessToken ?? null,
        persisted: session?.persisted ?? true,
        configured: true,
        pending,
        notice,
        dismissNotice: () => setNotice(null),
        signIn,
        reopenSignIn,
        cancelSignIn,
        signOut,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
