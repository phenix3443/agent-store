import { test, expect } from 'bun:test'
import { FIELD_SCHEMAS } from '../publish-field-schemas'

test('provider schema has no conditional fields', () => {
  const fields = FIELD_SCHEMAS.provider
  expect(fields.map((f) => f.key)).toEqual(['name', 'homepage', 'baseUrl', 'supportedModels'])
})

test('mcp schema shows command field only when transport is stdio', () => {
  const commandField = FIELD_SCHEMAS.mcp.find((f) => f.key === 'command')!
  expect(commandField.when!({ transport: 'stdio' })).toBe(true)
  expect(commandField.when!({ transport: 'http' })).toBe(false)
})

test('mcp schema shows url field only when transport is sse or http', () => {
  const urlField = FIELD_SCHEMAS.mcp.find((f) => f.key === 'url')!
  expect(urlField.when!({ transport: 'sse' })).toBe(true)
  expect(urlField.when!({ transport: 'stdio' })).toBe(false)
})

test('skill schema shows installScript only when installMethod is script', () => {
  const scriptField = FIELD_SCHEMAS.skill.find((f) => f.key === 'installScript')!
  expect(scriptField.when!({ installMethod: 'script' })).toBe(true)
  expect(scriptField.when!({ installMethod: 'zip' })).toBe(false)
})
