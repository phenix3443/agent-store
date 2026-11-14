import { test, expect } from 'bun:test'
import { offerSupplement } from '../supplement'

const r = (name: string, upstreamId = `o/r/${name}`) => ({ name, origin: { upstreamId } }) as Parameters<typeof offerSupplement>[2][number]

test('a search with no local match is offered the supplement', () => {
  expect(offerSupplement('pdf tools', null, [])).toBe(true)
  expect(offerSupplement('pdf tools', 'skill', [])).toBe(true)
})

test('MCP and provider searches are not: the other directories list skills only', () => {
  expect(offerSupplement('pdf', 'mcp', [])).toBe(false)
  expect(offerSupplement('pdf', 'provider', [])).toBe(false)
})

test('a result named exactly like the query is enough on its own', () => {
  expect(offerSupplement('PDF', null, [r('pdf')])).toBe(false)
  expect(offerSupplement('pdf', null, [r('Docs', 'anthropics/skills/pdf')])).toBe(false)
})

test('few named results, or only description matches, are offered it', () => {
  expect(offerSupplement('pdf', null, [r('pdf-tools'), r('pdf-merge')])).toBe(true)
  expect(offerSupplement('pdf', null, [r('alpha'), r('beta'), r('gamma')])).toBe(true)
  expect(offerSupplement('pdf', null, [r('pdf-a'), r('pdf-b'), r('pdf-c')])).toBe(false)
})

test('queries the API would not send anywhere are not offered it', () => {
  expect(offerSupplement('a', null, [])).toBe(false)
  expect(offerSupplement('me@example.com', null, [])).toBe(false)
  expect(offerSupplement('https://x.dev', null, [])).toBe(false)
  expect(offerSupplement('---', null, [])).toBe(false)
  expect(offerSupplement('a b c d e f g', null, [])).toBe(false)
})
