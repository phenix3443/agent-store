import { test, expect } from 'bun:test'
import { applyModelMapping } from '../model-mapping'

test('exact match replaces the model field', () => {
  const result = applyModelMapping(
    { model: 'claude-3-5-sonnet', messages: [] },
    { 'claude-3-5-sonnet': 'gpt-4o' }
  ) as { model: string }
  expect(result.model).toBe('gpt-4o')
})

test('wildcard suffix match replaces the model field', () => {
  const result = applyModelMapping(
    { model: 'claude-3-5-haiku', messages: [] },
    { 'claude-*': 'gpt-4o-mini' }
  ) as { model: string }
  expect(result.model).toBe('gpt-4o-mini')
})

test('exact match takes priority over wildcard', () => {
  const result = applyModelMapping(
    { model: 'claude-3-5-sonnet', messages: [] },
    { 'claude-3-5-sonnet': 'gpt-4o', 'claude-*': 'gpt-4o-mini' }
  ) as { model: string }
  expect(result.model).toBe('gpt-4o')
})

test('no match returns the model unchanged', () => {
  const result = applyModelMapping(
    { model: 'unmapped-model', messages: [] },
    { 'claude-*': 'gpt-4o-mini' }
  ) as { model: string }
  expect(result.model).toBe('unmapped-model')
})

test('undefined modelMapping returns the same body reference', () => {
  const body = { model: 'claude-3-5-sonnet' }
  expect(applyModelMapping(body, undefined)).toBe(body)
})

test('body without a model field is returned unchanged', () => {
  const body = { messages: [] }
  expect(applyModelMapping(body, { 'claude-*': 'gpt-4o-mini' })).toEqual(body)
})

test('non-object body is returned unchanged', () => {
  expect(applyModelMapping('not an object', { 'claude-*': 'gpt-4o-mini' })).toBe('not an object')
  expect(applyModelMapping(null, { 'claude-*': 'gpt-4o-mini' })).toBe(null)
})
