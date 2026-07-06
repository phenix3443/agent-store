import { test, expect } from 'bun:test'
import { validateCreateItem, type CreateItemInput } from '../publisher-items'

const base: CreateItemInput = {
  slug: 'my-skill', name: 'My Skill', description: 'desc', category: 'skill', version: '1.0.0',
}

test('accepts a minimal payload without readmeUrl or icon', () => {
  expect(validateCreateItem(base)).toBeNull()
})

test('rejects a missing required field', () => {
  expect(validateCreateItem({ ...base, version: '' })).toEqual({ error: 'Missing required field: version', status: 422 })
})

test('rejects an invalid category', () => {
  expect(validateCreateItem({ ...base, category: 'plugin' as CreateItemInput['category'] })).toEqual({
    error: 'Invalid category',
    status: 422,
  })
})

test('requires serverCommand for stdio MCP', () => {
  expect(validateCreateItem({ ...base, category: 'mcp', metadata: { transport: 'stdio' } })).toEqual({
    error: 'Missing MCP serverCommand',
    status: 422,
  })
})

test('requires url for http MCP', () => {
  expect(validateCreateItem({ ...base, category: 'mcp', metadata: { transport: 'http' } })).toEqual({
    error: 'Missing MCP url',
    status: 422,
  })
})

test('accepts a valid stdio MCP', () => {
  expect(validateCreateItem({ ...base, category: 'mcp', metadata: { transport: 'stdio', serverCommand: 'npx x' } })).toBeNull()
})
