import { randomBytes, timingSafeEqual } from 'crypto'
import { linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

/** Codex sends the token in this header (provider `http_headers`); Claude Code sends it as `Authorization: Bearer`. */
export const RELAY_TOKEN_HEADER = 'x-aas-relay-token'

export function relayTokenPath(aasHome: string): string {
  return join(aasHome, 'relay-token')
}

/** The token if one was created; never creates it. */
export function readRelayToken(aasHome: string): string | undefined {
  return readToken(relayTokenPath(aasHome))
}

function readToken(path: string): string | undefined {
  try {
    const token = readFileSync(path, 'utf-8').trim()
    return token || undefined
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw e
  }
}

/**
 * Returns the relay token, creating it (0600) on first use. Every tool config and
 * the relay must agree on one value, so concurrent first calls must not each write
 * their own: the file is published with link(), which fails if another process won.
 */
export function ensureRelayToken(aasHome: string): string {
  const path = relayTokenPath(aasHome)
  const existing = readToken(path)
  if (existing) return existing
  mkdirSync(aasHome, { recursive: true })
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}`
  writeFileSync(tmp, randomBytes(32).toString('base64url'), { mode: 0o600 })
  try {
    linkSync(tmp, path)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
  } finally {
    rmSync(tmp, { force: true })
  }
  const token = readToken(path)
  if (!token) throw new Error(`${path} is empty; delete it and retry`)
  return token
}

function sameToken(given: string | null | undefined, token: string): boolean {
  if (!given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function hasRelayToken(headers: Headers, token: string): boolean {
  const auth = headers.get('authorization')
  const bearer = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : undefined
  return sameToken(bearer, token) || sameToken(headers.get(RELAY_TOKEN_HEADER), token)
}
