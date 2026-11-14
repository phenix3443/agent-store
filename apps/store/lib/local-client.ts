'use client'

// The desktop client's read-only endpoint (apps/client-core/src/local-api/server.ts). It
// answers only the store's own origins, so another site cannot read it.
export const LOCAL_API = 'http://127.0.0.1:18781'

// Set once this browser has handed something to the desktop client. Without it the page
// never asks, so visitors without the client never see the browser's local-network prompt.
const SEEN_KEY = 'as.desktopClient'

export function markDesktopSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // Without storage the page just never asks.
  }
}

function desktopSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

/** Chromium's Local Network Access permission; renamed from `local-network-access` to `loopback-network`. */
export async function loopbackPermission(): Promise<PermissionState | 'unknown'> {
  for (const name of ['loopback-network', 'local-network-access']) {
    try {
      return (await navigator.permissions.query({ name } as unknown as PermissionDescriptor)).state
    } catch {
      // Not a permission this browser knows.
    }
  }
  return 'unknown'
}

export async function shouldAskClient(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const permission = await loopbackPermission()
  if (permission === 'denied') return false
  return permission === 'granted' || desktopSeen()
}

/** The asked ids the client reports installed; null when it could not be asked (not running, blocked, too slow). */
export async function askInstalled(ids: string[], timeoutMs = 1500): Promise<Set<string> | null> {
  if (ids.length === 0) return new Set()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${LOCAL_API}/v1/installed?ids=${encodeURIComponent(ids.join(','))}`, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    })
    if (!res.ok) return null
    const body = (await res.json()) as { installed?: unknown }
    if (!Array.isArray(body.installed)) return null
    const asked = new Set(ids)
    return new Set(body.installed.filter((id): id is string => typeof id === 'string' && asked.has(id)))
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
