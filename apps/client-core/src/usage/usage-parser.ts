export interface UsageTokens {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

const ZERO_USAGE: UsageTokens = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }

function parseSseDataLines(bodyText: string): unknown[] {
  const events: unknown[] = []
  for (const line of bodyText.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const jsonText = trimmed.slice('data:'.length).trim()
    try {
      events.push(JSON.parse(jsonText))
    } catch {
      // skip malformed data lines
    }
  }
  return events
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function readNumber(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

export function parseClaudeUsage(bodyText: string, isStreaming: boolean): UsageTokens {
  try {
    if (!isStreaming) {
      const parsed = JSON.parse(bodyText) as { usage?: Record<string, unknown> }
      const usage = parsed.usage ?? {}
      return {
        inputTokens: readNumber(usage['input_tokens']),
        outputTokens: readNumber(usage['output_tokens']),
        cacheReadTokens: readNumber(usage['cache_read_input_tokens']),
        cacheWriteTokens: readNumber(usage['cache_creation_input_tokens']),
      }
    }

    const result = { ...ZERO_USAGE }
    for (const event of parseSseDataLines(bodyText)) {
      const record = readRecord(event)
      if (!record) continue
      if (record['type'] === 'message_start') {
        const message = readRecord(record['message'])
        const usage = readRecord(message?.['usage'])
        if (usage) {
          result.inputTokens = readNumber(usage['input_tokens'])
          result.cacheReadTokens = readNumber(usage['cache_read_input_tokens'])
          result.cacheWriteTokens = readNumber(usage['cache_creation_input_tokens'])
        }
      } else if (record['type'] === 'message_delta') {
        const usage = readRecord(record['usage'])
        if (usage && typeof usage['output_tokens'] === 'number') {
          result.outputTokens = usage['output_tokens']
        }
      }
    }
    return result
  } catch {
    return { ...ZERO_USAGE }
  }
}

export function parseOpenAIUsage(bodyText: string, isStreaming: boolean): UsageTokens {
  try {
    const extractFromUsage = (usage: Record<string, unknown> | undefined): UsageTokens => {
      if (!usage) return { ...ZERO_USAGE }
      const details = readRecord(usage['input_tokens_details'])
      return {
        inputTokens: readNumber(usage['input_tokens']),
        outputTokens: readNumber(usage['output_tokens']),
        cacheReadTokens: readNumber(details?.['cached_tokens']),
        cacheWriteTokens: 0,
      }
    }

    if (!isStreaming) {
      const parsed = JSON.parse(bodyText) as { usage?: Record<string, unknown> }
      return extractFromUsage(parsed.usage)
    }

    for (const event of parseSseDataLines(bodyText)) {
      const record = readRecord(event)
      if (record?.['type'] === 'response.completed') {
        const response = readRecord(record['response'])
        return extractFromUsage(readRecord(response?.['usage']))
      }
    }
    return { ...ZERO_USAGE }
  } catch {
    return { ...ZERO_USAGE }
  }
}
