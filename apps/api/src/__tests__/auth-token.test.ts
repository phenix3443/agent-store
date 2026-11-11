import { test, expect } from 'bun:test'
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet, type JWTVerifyGetKey } from 'jose'
import { verifyAuthToken } from '../auth-token'

// Better Auth's jwt plugin signs with EdDSA/Ed25519 by default. Reproduce that
// offline: a local Ed25519 key + JWKS, so verification needs no network.
const { publicKey, privateKey } = await generateKeyPair('Ed25519', { extractable: true })
const jwk = { ...(await exportJWK(publicKey)), alg: 'EdDSA', kid: 'test-key' }
const jwks: JWTVerifyGetKey = createLocalJWKSet({ keys: [jwk] })

async function sign(claims: Record<string, unknown>, sub?: string): Promise<string> {
  const jwt = new SignJWT(claims).setProtectedHeader({ alg: 'EdDSA', kid: 'test-key' }).setIssuedAt().setExpirationTime('1h')
  if (sub !== undefined) jwt.setSubject(sub)
  return jwt.sign(privateKey)
}

const env = { AUTH_JWKS_URL: 'https://example.test/jwks.json' }

test('verifies a valid token and extracts id + email', async () => {
  const token = await sign({ email: 'dev@example.com', name: 'Dev' }, 'user-123')
  expect(await verifyAuthToken(env, token, jwks)).toEqual({ id: 'user-123', email: 'dev@example.com', username: undefined })
})

test('email is omitted when the claim is absent', async () => {
  const token = await sign({}, 'user-123')
  expect(await verifyAuthToken(env, token, jwks)).toEqual({ id: 'user-123', email: undefined, username: undefined })
})

test('rejects a token without a subject', async () => {
  const token = await sign({ email: 'dev@example.com' })
  expect(await verifyAuthToken(env, token, jwks)).toBeNull()
})

test('rejects a token signed by a different key', async () => {
  const other = await generateKeyPair('Ed25519', { extractable: true })
  const token = await new SignJWT({ email: 'x@example.com' })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'test-key' })
    .setSubject('user-123')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(other.privateKey)
  expect(await verifyAuthToken(env, token, jwks)).toBeNull()
})

test('rejects an expired token', async () => {
  const token = await new SignJWT({ email: 'x@example.com' })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'test-key' })
    .setSubject('user-123')
    .setIssuedAt(0)
    .setExpirationTime(1)
    .sign(privateKey)
  expect(await verifyAuthToken(env, token, jwks)).toBeNull()
})

test('returns null when verification is not configured (no JWKS)', async () => {
  const token = await sign({ email: 'dev@example.com' }, 'user-123')
  expect(await verifyAuthToken({}, token, undefined)).toBeNull()
})

test('returns null for a missing token', async () => {
  expect(await verifyAuthToken(env, undefined, jwks)).toBeNull()
})

test('carries the GitHub username claim', async () => {
  const token = await sign({ email: 'dev@example.com', username: 'obra' }, 'user-123')
  expect(await verifyAuthToken(env, token, jwks)).toEqual({ id: 'user-123', email: 'dev@example.com', username: 'obra' })
})

test('with AUTH_ISSUER set, rejects a token from another issuer', async () => {
  const issuer = 'https://store.example'
  const good = await new SignJWT({}).setProtectedHeader({ alg: 'EdDSA', kid: 'test-key' }).setSubject('u')
    .setIssuer(issuer).setAudience(issuer).setIssuedAt().setExpirationTime('1h').sign(privateKey)
  const bad = await new SignJWT({}).setProtectedHeader({ alg: 'EdDSA', kid: 'test-key' }).setSubject('u')
    .setIssuer('https://evil.example').setAudience(issuer).setIssuedAt().setExpirationTime('1h').sign(privateKey)
  const withIssuer = { ...env, AUTH_ISSUER: issuer }
  expect((await verifyAuthToken(withIssuer, good, jwks))?.id).toBe('u')
  expect(await verifyAuthToken(withIssuer, bad, jwks)).toBeNull()
})
