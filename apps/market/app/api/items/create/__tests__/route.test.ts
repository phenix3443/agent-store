import { test, expect, mock } from 'bun:test'

// Authenticated user mock
const mockUser = {
  id: 'user-1',
  user_metadata: { user_name: 'testdev' },
}

function makeMockSupabase(opts: {
  user?: typeof mockUser | null
  publisher?: { id: string } | null
  insertError?: { code?: string } | null
} = {}) {
  const { user = mockUser, publisher = { id: 'pub-1' }, insertError = null } = opts

  return {
    auth: {
      getUser: async () => ({
        data: { user },
        error: user ? null : { message: 'Not authenticated' },
      }),
    },
    from: (table: string) => {
      if (table === 'publishers') {
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                single: async () => ({ data: publisher, error: publisher ? null : { code: 'PGRST116' } }),
              }),
            }),
          }),
        }
      }
      // items table
      return {
        insert: async () => ({ error: insertError }),
      }
    },
  }
}

mock.module('@/lib/supabase/server', () => ({
  createClient: () => makeMockSupabase(),
}))

import { POST } from '../route'

const validBody = {
  slug: 'test-item',
  name: 'Test Item',
  description: 'A test item',
  category: 'skill',
  version: '1.0.0',
  readmeUrl: 'https://example.com/readme',
  icon: 'https://example.com/icon.png',
  compatibleWith: ['claude'],
  tags: ['test'],
}

test('POST /api/items/create returns 201 on valid submission', async () => {
  const req = new Request('http://localhost/api/items/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validBody),
  }) as unknown as import('next/server').NextRequest
  const res = await POST(req)
  expect(res.status).toBe(201)
})

test('POST /api/items/create returns 401 when unauthenticated', async () => {
  mock.module('@/lib/supabase/server', () => ({
    createClient: () => makeMockSupabase({ user: null }),
  }))

  const req = new Request('http://localhost/api/items/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validBody),
  }) as unknown as import('next/server').NextRequest
  const res = await POST(req)
  expect(res.status).toBe(401)
})

test('POST /api/items/create returns 422 for missing required field', async () => {
  mock.module('@/lib/supabase/server', () => ({
    createClient: () => makeMockSupabase(),
  }))

  const { name: _, ...noName } = validBody
  const req = new Request('http://localhost/api/items/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(noName),
  }) as unknown as import('next/server').NextRequest
  const res = await POST(req)
  expect(res.status).toBe(422)
})

test('POST /api/items/create returns 422 for invalid category', async () => {
  mock.module('@/lib/supabase/server', () => ({
    createClient: () => makeMockSupabase(),
  }))

  const req = new Request('http://localhost/api/items/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...validBody, category: 'plugin' }),
  }) as unknown as import('next/server').NextRequest
  const res = await POST(req)
  expect(res.status).toBe(422)
})

test('POST /api/items/create returns 409 on duplicate slug', async () => {
  mock.module('@/lib/supabase/server', () => ({
    createClient: () => makeMockSupabase({ insertError: { code: '23505' } }),
  }))

  const req = new Request('http://localhost/api/items/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validBody),
  }) as unknown as import('next/server').NextRequest
  const res = await POST(req)
  expect(res.status).toBe(409)
})
