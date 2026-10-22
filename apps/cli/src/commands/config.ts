import type { Engine, JsonSchema } from '@as/types'
import type { ClosablePrompter, Prompter } from '../utils/prompt'
import { createReadlinePrompter } from '../utils/prompt'

interface SchemaProperty {
  type?: string
  description?: string
  default?: unknown
  'x-env'?: string
  'x-bearer'?: boolean
}

const upperSnake = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()

function sortSchemaProperties(
  properties: Record<string, SchemaProperty>,
  required: string[],
): Array<[string, SchemaProperty]> {
  const requiredSet = new Set(required)
  return Object.entries(properties).sort(([leftKey], [rightKey]) => {
    const leftRequired = requiredSet.has(leftKey)
    const rightRequired = requiredSet.has(rightKey)
    if (leftRequired !== rightRequired) {
      return leftRequired ? -1 : 1
    }
    return leftKey.localeCompare(rightKey)
  })
}

export async function runConfig(
  engine: Engine,
  args: string[],
  prompter: Prompter = createReadlinePrompter(),
  out: (s: string) => void = console.log
): Promise<void> {
  const slug = args[0]
  if (!slug) {
    out('Usage: aas config <slug>')
    return
  }

  const { schema, current } = await engine.getConfigSchema(slug)
  const properties = (schema as { properties?: Record<string, SchemaProperty>; required?: string[] }).properties ?? {}
  const required = (schema as { required?: string[] }).required ?? []

  out(`  ${slug} — configuration`)

  const values: Record<string, unknown> = { ...current }

  try {
    for (const [key, prop] of sortSchemaProperties(properties, required)) {
      const isRequired = required.includes(key)
      const label = prop.description ?? key
      const qualifier = isRequired ? 'required' : prop.default != null ? `optional, default: ${String(prop.default)}` : 'optional'
      const question = `  ${label} (${qualifier})\n  > `
      const answer = await prompter(question)
      if (answer === '' && prop.default != null) {
        values[key] = prop.default
      } else if (answer !== '') {
        values[key] = answer
      }
    }

    await engine.setConfig(slug, values)
    out('')
    out('  Saved. Run `aas sync` to apply changes.')
    // Codex reads a bearer token from the environment, never from config.toml (§5.6).
    for (const [key, prop] of Object.entries(properties)) {
      if (prop['x-bearer'] && values[key] !== undefined && values[key] !== '') {
        out(`  For Codex, export the token before starting it: export ${prop['x-env'] ?? upperSnake(key)}=<your ${prop.description ?? key}>`)
      }
    }
  } finally {
    ;(prompter as ClosablePrompter).close?.()
  }
}
