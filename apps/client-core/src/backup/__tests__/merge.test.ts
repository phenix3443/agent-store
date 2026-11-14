import { test, expect } from 'bun:test'
import { decide, decideItem } from '../merge'
import type { ItemIds } from '../repo'

const ids = (content: string, state: string, hasFiles = true): ItemIds => ({ content, state, hasFiles })
const none = { pending: new Set<string>(), localIsBase: new Set<string>() }
const K = 'skill/s'

test('only one side changed: that side is taken, part by part', () => {
  const base = ids('c0', 's0')
  expect(decideItem(K, base, ids('c1', 's0'), base, none).take).toEqual({ content: 'local', state: 'remote' })
  expect(decideItem(K, base, base, ids('c0', 's1'), none).take).toEqual({ content: 'remote', state: 'remote' })
})

test('an edit on one device and a toggle on the other combine without a conflict', () => {
  const d = decideItem(K, ids('c0', 's0'), ids('c1', 's0'), ids('c0', 's1'), none)
  expect(d.conflict).toBeUndefined()
  expect(d.take).toEqual({ content: 'local', state: 'remote' })
})

test('both sides changing the same part differently is a conflict on that part only', () => {
  const d = decideItem(K, ids('c0', 's0'), ids('c1', 's0'), ids('c2', 's0'), none)
  expect(d.conflict).toEqual({ reason: 'both-changed', parts: ['content'] })
  expect(d.take).toEqual({ content: 'remote', state: 'remote' })
})

test('the same change on both sides is no conflict', () => {
  expect(decideItem(K, ids('c0', 's0'), ids('c1', 's1'), ids('c1', 's1'), none).conflict).toBeUndefined()
})

test('deletions: unchanged on the other side is deleted, changed there is a conflict', () => {
  const base = ids('c0', 's0')
  expect(decideItem(K, base, undefined, base, none).take.content).toBe('local')
  expect(decideItem(K, base, base, undefined, none).take.content).toBe('remote')
  expect(decideItem(K, base, undefined, ids('c1', 's0'), none).conflict?.reason).toBe('deleted-here')
  expect(decideItem(K, base, ids('c1', 's0'), undefined, none).conflict?.reason).toBe('deleted-there')
})

test('without a base, one-sided items are taken and differing ones conflict', () => {
  expect(decideItem(K, undefined, ids('c1', 's1'), undefined, none).take.content).toBe('local')
  expect(decideItem(K, undefined, undefined, ids('c1', 's1'), none).take.content).toBe('remote')
  expect(decideItem(K, undefined, ids('c1', 's1'), ids('c1', 's2'), none).conflict?.parts).toEqual(['state'])
})

test('a pending conflict stays frozen until both sides agree', () => {
  const pending = { pending: new Set([K]), localIsBase: new Set<string>() }
  const base = ids('c2', 's0')
  expect(decideItem(K, base, ids('c1', 's0'), base, pending).conflict).toBeDefined()
  expect(decideItem(K, base, ids('c1', 's0'), ids('c1', 's0'), pending).conflict).toBeUndefined()
})

test('a failed item takes the remote side instead of uploading what is here', () => {
  const input = { pending: new Set<string>(), localIsBase: new Set([K]) }
  const base = ids('c0', 's0')
  expect(decideItem(K, base, undefined, ids('c1', 's0'), input).take.content).toBe('remote')
  expect(decideItem(K, base, undefined, base, input).take.content).toBe('remote')
})

test('a too-large placeholder never replaces real content in either direction', () => {
  const real = ids('c1', 's0')
  const big = ids('p1', 's0', false)
  const localBig = decideItem(K, real, big, ids('c2', 's0'), none)
  expect(localBig.conflict).toBeUndefined()
  expect(localBig.take.content).toBe('remote')
  expect(localBig.keepLocalContent).toBe(true)
  expect(decideItem(K, real, ids('c2', 's0'), big, none).take.content).toBe('local')
})

test('decide covers every key on any side, in order', () => {
  const m = (entries: Array<[string, ItemIds]>) => new Map(entries)
  const out = decide({
    base: m([['mcp/a', ids('1', '1')]]),
    local: m([['skill/b', ids('2', '2')]]),
    remote: m([['mcp/a', ids('1', '1')], ['provider/c', ids('3', '3')]]),
    ...none,
  })
  expect(out.map(d => d.key)).toEqual(['mcp/a', 'provider/c', 'skill/b'])
})
