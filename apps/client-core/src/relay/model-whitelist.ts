function matchesPattern(model: string, pattern: string): boolean {
  const effectivePattern = pattern.includes('/') ? pattern.split('/').pop()! : pattern
  if (effectivePattern.endsWith('*')) {
    return model.startsWith(effectivePattern.slice(0, -1))
  }
  return model === effectivePattern
}

export function isModelAllowed(model: string, whitelist: string[] | undefined): boolean {
  if (!whitelist || whitelist.length === 0) return true
  return whitelist.some((pattern) => matchesPattern(model, pattern))
}
