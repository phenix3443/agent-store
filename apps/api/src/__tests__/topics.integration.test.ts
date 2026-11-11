import { test, expect } from 'bun:test'
import type { Topic, TopicSummary } from '@as/types'
import { getDb } from '../db/client'
import { items, publishers, topics } from '../db/schema'
import { app } from '../app'

// Exercises the topic routes end to end against a real Postgres. Every row uses a
// random suffix so runs never collide.
const DB_URL = process.env['DATABASE_URL']
const maybe = DB_URL ? test : test.skip
const env = { DATABASE_URL: DB_URL }

async function seedTopic() {
  const db = getDb(env)
  const tag = crypto.randomUUID().slice(0, 8)
  const [pub] = await db
    .insert(publishers)
    .values({ slug: `test-pub-${tag}`, name: 'Test', avatarUrl: 'https://example.com/a.png', tier: 'community' })
    .returning({ id: publishers.id })
  const pkg = (name: string) => `test-${name}-${tag}`
  const item = (name: string, status: string) => ({
    slug: pkg(name), name, description: name, category: 'skill', version: '1.0.0', publisherId: pub!.id, status,
  })
  await db.insert(items).values([item('a', 'published'), item('b', 'published'), item('hidden', 'rejected')])

  const topic = `test-topic-${tag}`
  const other = `test-other-${tag}`
  await db.insert(topics).values([
    {
      slug: topic, title: '主题', description: '一句话。', intro: '一段话。', capabilities: ['能做的事'],
      packages: [pkg('b'), pkg('gone'), pkg('hidden'), pkg('a')],
      related: [`test-missing-${tag}`, other],
    },
    { slug: other, title: '另一个', description: '一句话。', intro: '一段话。', packages: [pkg('a'), pkg('b')] },
  ])
  return { topic, other, pkg }
}

const get = (path: string) => app.fetch(new Request(`http://localhost${path}`), env)

maybe('GET /api/topics lists topics with the count of published packages', async () => {
  const { topic, other } = await seedTopic()
  const res = await get('/api/topics')
  expect(res.status).toBe(200)
  const body = (await res.json()) as { topics: TopicSummary[] }
  expect(body.topics.find((t) => t.slug === topic)).toEqual({ slug: topic, title: '主题', description: '一句话。', packageCount: 2 })
  expect(body.topics.find((t) => t.slug === other)?.packageCount).toBe(2)
})

maybe('GET /api/topics/:slug expands packages in order, skipping missing and unpublished ones', async () => {
  const { topic, other, pkg } = await seedTopic()
  const res = await get(`/api/topics/${topic}`)
  expect(res.status).toBe(200)
  const body = (await res.json()) as { topic: Topic }
  expect(body.topic.packages.map((p) => p.slug)).toEqual([pkg('b'), pkg('a')])
  expect(body.topic.packages[0]!.publisher.name).toBe('Test')
  expect(body.topic.capabilities).toEqual(['能做的事'])
  expect(body.topic.related).toEqual([{ slug: other, title: '另一个' }])
})

maybe('GET /api/topics/:slug returns 404 for an unknown topic', async () => {
  const res = await get('/api/topics/no-such-topic')
  expect(res.status).toBe(404)
  expect(await res.json()).toEqual({ error: 'Not found' })
})
