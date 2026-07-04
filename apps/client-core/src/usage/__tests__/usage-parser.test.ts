import { test, expect } from 'bun:test'
import { parseClaudeUsage, parseOpenAIUsage } from '../usage-parser'

test('parseClaudeUsage: non-streaming JSON body', () => {
  const body = JSON.stringify({
    id: 'msg_1',
    usage: { input_tokens: 25, output_tokens: 45, cache_creation_input_tokens: 5, cache_read_input_tokens: 10 },
  })
  const usage = parseClaudeUsage(body, false)
  expect(usage).toEqual({ inputTokens: 25, outputTokens: 45, cacheReadTokens: 10, cacheWriteTokens: 5 })
})

test('parseClaudeUsage: non-streaming body missing cache fields defaults them to 0', () => {
  const body = JSON.stringify({ id: 'msg_1', usage: { input_tokens: 25, output_tokens: 45 } })
  const usage = parseClaudeUsage(body, false)
  expect(usage).toEqual({ inputTokens: 25, outputTokens: 45, cacheReadTokens: 0, cacheWriteTokens: 0 })
})

test('parseClaudeUsage: streaming SSE — input from message_start, output from the final message_delta', () => {
  const body = [
    'event: message_start',
    'data: {"type":"message_start","message":{"usage":{"input_tokens":25,"cache_creation_input_tokens":5,"cache_read_input_tokens":10,"output_tokens":1}}}',
    '',
    'event: content_block_delta',
    'data: {"type":"content_block_delta","delta":{"text":"hi"}}',
    '',
    'event: message_delta',
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":45}}',
    '',
  ].join('\n')
  const usage = parseClaudeUsage(body, true)
  expect(usage).toEqual({ inputTokens: 25, outputTokens: 45, cacheReadTokens: 10, cacheWriteTokens: 5 })
})

test('parseOpenAIUsage: non-streaming JSON body', () => {
  const body = JSON.stringify({
    id: 'resp_1',
    usage: { input_tokens: 50, output_tokens: 20, input_tokens_details: { cached_tokens: 12 } },
  })
  const usage = parseOpenAIUsage(body, false)
  expect(usage).toEqual({ inputTokens: 50, outputTokens: 20, cacheReadTokens: 12, cacheWriteTokens: 0 })
})

test('parseOpenAIUsage: streaming SSE — reads usage from the response.completed event', () => {
  const body = [
    'event: response.output_text.delta',
    'data: {"type":"response.output_text.delta","delta":"hi"}',
    '',
    'event: response.completed',
    'data: {"type":"response.completed","response":{"usage":{"input_tokens":50,"output_tokens":20,"input_tokens_details":{"cached_tokens":12}}}}',
    '',
  ].join('\n')
  const usage = parseOpenAIUsage(body, true)
  expect(usage).toEqual({ inputTokens: 50, outputTokens: 20, cacheReadTokens: 12, cacheWriteTokens: 0 })
})

test('parseOpenAIUsage: missing input_tokens_details defaults cacheReadTokens to 0', () => {
  const body = JSON.stringify({ id: 'resp_1', usage: { input_tokens: 50, output_tokens: 20 } })
  const usage = parseOpenAIUsage(body, false)
  expect(usage.cacheReadTokens).toBe(0)
})

test('parseClaudeUsage: unparseable streaming body returns all zeros rather than throwing', () => {
  const usage = parseClaudeUsage('not valid sse at all', true)
  expect(usage).toEqual({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
})
