import { test, expect, mock } from 'bun:test'
import type { Topic, TopicSummary } from '@as/types'

const summary: TopicSummary = { slug: 'docs', title: '文档', description: '查文档。', packageCount: 2 }
const detail: Topic = { ...summary, intro: '一段话。', capabilities: ['查文档'], packages: [], related: [] }
let failNext = false

mock.module('../topic-queries', () => ({
  getTopics: async () => (failNext ? { data: [], error: 'boom' } : { data: [summary], error: null }),
  getTopicBySlug: async (_env: unknown, slug: string) => ({ data: slug === 'docs' ? detail : null, error: null }),
}))

const { app } = await import('../app')
const get = (path: string) => app.fetch(new Request(`http://localhost${path}`))

test('GET /api/topics returns { topics }', async () => {
  const res = await get('/api/topics')
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ topics: [summary] })
})

test('GET /api/topics returns 500 with a requestId when the query fails', async () => {
  failNext = true
  const res = await get('/api/topics')
  failNext = false
  expect(res.status).toBe(500)
  const body = (await res.json()) as { error: string; requestId: string }
  expect(body.error).toBe('Failed to fetch topics')
  expect(body.requestId).toBeTruthy()
})

test('GET /api/topics/:slug returns { topic }', async () => {
  const res = await get('/api/topics/docs')
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ topic: detail })
})

test('GET /api/topics/:slug returns 404 for an unknown topic', async () => {
  const res = await get('/api/topics/nope')
  expect(res.status).toBe(404)
  expect(await res.json()).toEqual({ error: 'Not found' })
})
