import { test, expect } from 'bun:test'
import { isModelAllowed } from '../model-whitelist'

test('isModelAllowed: undefined or empty whitelist allows everything', () => {
  expect(isModelAllowed('claude-sonnet-4-5', undefined)).toBe(true)
  expect(isModelAllowed('claude-sonnet-4-5', [])).toBe(true)
})

test('isModelAllowed: exact match', () => {
  expect(isModelAllowed('gpt-4o', ['gpt-4o'])).toBe(true)
  expect(isModelAllowed('gpt-4o-mini', ['gpt-4o'])).toBe(false)
})

test('isModelAllowed: prefix wildcard match', () => {
  expect(isModelAllowed('claude-sonnet-4-5', ['claude-*'])).toBe(true)
  expect(isModelAllowed('claude-opus-4-8', ['claude-*'])).toBe(true)
  expect(isModelAllowed('gpt-4o', ['claude-*'])).toBe(false)
})

test('isModelAllowed: vendor-prefixed wildcard strips the vendor segment before matching', () => {
  expect(isModelAllowed('claude-sonnet-4-5', ['anthropic/claude-*'])).toBe(true)
  expect(isModelAllowed('gpt-4o', ['anthropic/claude-*'])).toBe(false)
})

test('isModelAllowed: any matching entry in a multi-entry whitelist allows the model', () => {
  expect(isModelAllowed('gpt-4o', ['claude-*', 'gpt-4o'])).toBe(true)
  expect(isModelAllowed('gpt-5', ['claude-*', 'gpt-4o'])).toBe(false)
})
