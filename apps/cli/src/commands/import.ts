import type { Engine, ImportScan, McpCandidate, SkillCandidate } from '@as/types'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, errorMessage } from '../utils/exit-codes'

const USAGE = `Usage: aas import <command>

  scan [--json] [--match-catalog]          Your own skills and MCP servers that Agent Store does not manage (read-only)
  apply <id>... | --all [--match-catalog]  Take them over; originals are backed up and can be put back
  undo [<import-id>] [--force]             Put the latest import (or <import-id>) back as it was
  list                                     Past imports

--match-catalog: look each name up in Agent Store's catalog, which sends the names (nothing else)
to the catalog service. A skill identical to a catalog entry is then tied to it and can be updated;
without it everything is imported as a local item.
<id> is what scan prints, e.g. skill:my-notes or mcp:github.`

const AGENT = { claude: 'Claude Code', codex: 'Codex' } as const

const REASON: Record<NonNullable<SkillCandidate['reason']>, string> = {
  symlink: 'a link to a skill kept elsewhere; manage it there',
  'external-link': 'links outside its directory, which would break in the library',
  'has-marker': 'already carries an Agent Store marker',
  'too-large': 'more than 2000 files',
  unreadable: 'could not be read',
}

function skillLine(s: SkillCandidate): string[] {
  const where = s.locations.map(l => `${AGENT[l.agent]} ${l.path}${l.linkTarget ? ` -> ${l.linkTarget}` : ''}`)
  const match = s.catalog ? (s.catalog.exact ? `  same as catalog ${s.catalog.id}` : `  catalog has another "${s.catalog.name}" (${s.catalog.id})`) : ''
  const head = s.importable ? `  ${s.id}` : `  ${s.id}  (not importable: ${REASON[s.reason!]})`
  return [head + match, ...where.map(w => `      ${w}`)]
}

function mcpLine(m: McpCandidate): string[] {
  const lines = [`  ${m.id}${m.catalog?.exact ? `  same package as catalog ${m.catalog.id}` : ''}`]
  for (const e of m.entries) {
    const run = e.transport === 'stdio' ? [e.command, ...(e.args ?? [])].join(' ') : `${e.transport} ${e.url ?? ''}`
    const extra = [
      e.envNames.length ? `env: ${e.envNames.join(', ')}` : '',
      e.headerNames.length ? `headers: ${e.headerNames.join(', ')}` : '',
      e.lossyKeys.length ? `kept only while not rewritten by the ${e.agent} CLI: ${e.lossyKeys.join(', ')}` : '',
    ].filter(Boolean).join('; ')
    lines.push(`      ${AGENT[e.agent]} ${e.path}: ${run}${extra ? `  (${extra})` : ''}`)
  }
  return lines
}

export function printScan(scan: ImportScan, out: (s: string) => void): void {
  for (const a of scan.agents) {
    const state = a.detected ? `found${a.version ? ` (${a.version})` : ''}` : 'not found'
    out(`  ${AGENT[a.agent]}: ${state}; CLI ${a.binary ?? 'not on PATH'}; config ${a.configDir}${a.configDirExists ? '' : ' (missing)'}`)
  }
  out('')
  for (const p of scan.problems) out(`  warn ${p.path} ${p.message}`)
  out(`  Skills (${scan.skills.filter(s => s.importable).length} importable)`)
  for (const s of scan.skills) for (const l of skillLine(s)) out(l)
  out(`  MCP servers (${scan.mcps.length})`)
  for (const m of scan.mcps) for (const l of mcpLine(m)) out(l)
  if (!scan.catalogChecked) out('  (not compared with the catalog; --match-catalog does)')
}

export async function runImport(engine: Engine, args: string[], out: (s: string) => void = console.log): Promise<number> {
  const [sub, ...rest] = args
  const matchCatalog = rest.includes('--match-catalog')
  const positional = rest.filter(a => !a.startsWith('--'))
  try {
    switch (sub) {
      case 'scan': {
        const scan = await engine.scanImports({ matchCatalog })
        if (rest.includes('--json')) out(JSON.stringify(scan, null, 2))
        else printScan(scan, out)
        return EXIT_OK
      }
      case 'apply': {
        let ids = positional
        if (rest.includes('--all')) {
          const scan = await engine.scanImports({ matchCatalog })
          ids = [...scan.skills.filter(s => s.importable).map(s => s.id), ...scan.mcps.map(m => m.id)]
          if (!ids.length) { out('  Nothing to import'); return EXIT_OK }
        }
        if (!ids.length) { out(USAGE); return EXIT_USAGE }
        const result = await engine.applyImport(ids, { matchCatalog })
        for (const i of result.items) out(`  imported ${i.id} as ${i.slug} (${i.agents.map(a => AGENT[a]).join(', ')})`)
        out(`  Import ${result.importId}; undo with: aas import undo ${result.importId}`)
        return EXIT_OK
      }
      case 'undo': {
        const result = await engine.undoImport(positional[0], { force: rest.includes('--force') })
        for (const i of result.items) {
          const how = i.result === 'bytes' ? 'restored as it was' : i.result === 'entry' ? 'entry written back' : i.result === 'kept-current' ? 'kept the entry as it is now' : `restored; the edited copy is kept at ${i.keptAt}`
          out(`  ${i.slug}: ${how}`)
        }
        out(`  Undid import ${result.importId}`)
        return EXIT_OK
      }
      case 'list': {
        const records = await engine.listImports()
        if (!records.length) { out('  No imports'); return EXIT_OK }
        for (const r of records) out(`  ${r.importId}  ${r.state}  ${r.items.map(i => i.slug).join(', ')}`)
        return EXIT_OK
      }
      default:
        out(USAGE)
        return sub ? EXIT_USAGE : EXIT_OK
    }
  } catch (err) {
    out(`  Error: ${errorMessage(err)}`)
    return EXIT_FAILURE
  }
}
