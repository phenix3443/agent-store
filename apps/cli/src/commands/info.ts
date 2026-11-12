import type { CatalogResourceDetail, Engine } from '@as/types'
import { errorMessage } from '../utils/exit-codes'

export async function runInfo(
  engine: Engine,
  args: string[],
  out: (s: string) => void = console.log
): Promise<void> {
  const ref = args[0]
  if (!ref) {
    out('Usage: aas info <id|slug>')
    return
  }

  const installed = ref.includes(':') ? undefined : await engine.info(ref).catch(() => undefined)
  if (!installed) {
    let r: CatalogResourceDetail
    try {
      r = await engine.getResource(ref)
    } catch (err) {
      out(`  Error: ${errorMessage(err)}`)
      process.exitCode = 1
      return
    }
    out('')
    out(`  ${r.name}  ${r.version ?? ''}   ${r.kind}${r.verified ? ' · verified' : ''}`)
    if (r.description) out(`  ${r.description}`)
    out('')
    out(`  Id           ${r.id}`)
    if (r.author) out(`  Author       ${r.author.name}${r.author.url ? ` (${r.author.url})` : ''}`)
    if (r.homepageUrl) out(`  Homepage     ${r.homepageUrl}`)
    if (r.kind === 'skill') out(`  Source       ${r.repo.fullName}/${r.repo.dir} @ ${r.repo.commit.slice(0, 12)}`)
    if (r.kind === 'mcp') {
      for (const p of r.packages) out(`  Package      ${p.registryType} ${p.identifier}${p.version ? `@${p.version}` : ''} (${p.transport.type})`)
      for (const x of r.remotes) out(`  Remote       ${x.type} ${x.url}`)
    }
    if (r.kind === 'provider' && r.connection) out(`  Endpoint     ${r.connection.baseUrl}`)
    out('')
    out(`  Not installed. Install with: aas install ${r.id}`)
    return
  }

  const detail = installed
  const status = (['claude', 'codex'] as const)
    .filter(t => detail.compatibleWith.includes(t))
    .map(t => {
      const d = detail.deployments?.[t]
      return `${t}: ${detail.enabledFor[t] ? 'enabled' : 'disabled'}${d ? ` (${d.mode} ${d.path})` : ''}`
    })
    .join('  |  ')

  out('')
  out(`  ${detail.slug}  ${detail.version}   ${detail.publisher.tier}`)
  out(`  ${detail.description}`)
  out('')
  if (detail.resourceId) out(`  Id           ${detail.resourceId}`)
  out(`  Publisher    ${detail.publisher.name} (${detail.publisher.slug})`)
  out(`  Compatible   ${detail.compatibleWith.join(' · ')}`)
  out(`  Installed    ${detail.installedAt.slice(0, 10)}  (updated ${detail.updatedAt.slice(0, 10)})`)
  out(`  Status       ${status}`)

  if (detail.supportedModels?.length) {
    out('')
    out('  Models')
    out(`    ${detail.supportedModels.join(' · ')}`)
  }

  if (detail.category === 'provider' || detail.category === 'mcp') {
    out('')
    out(`  Run \`aas config ${detail.slug}\` to update configuration.`)
  }
}
