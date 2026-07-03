function matchWildcard(pattern: string, model: string): boolean {
  if (!pattern.endsWith('*')) return false
  return model.startsWith(pattern.slice(0, -1))
}

function resolveMappedModel(model: string, modelMapping: Record<string, string>): string | undefined {
  if (modelMapping[model]) return modelMapping[model]
  for (const [pattern, target] of Object.entries(modelMapping)) {
    if (matchWildcard(pattern, model)) return target
  }
  return undefined
}

export function applyModelMapping(body: unknown, modelMapping: Record<string, string> | undefined): unknown {
  if (!modelMapping) return body
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body

  const record = body as Record<string, unknown>
  const model = record['model']
  if (typeof model !== 'string') return body

  const mapped = resolveMappedModel(model, modelMapping)
  if (!mapped) return body

  return { ...record, model: mapped }
}
