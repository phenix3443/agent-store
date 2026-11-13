import { copyFileSync, existsSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { Octokit } from '@octokit/rest'
import { countAvailable, openCatalogForWrite } from './catalog/db'
import { openDiscoveryForWrite } from './catalog/discovery'
import { defaultDiscoverySources, defaultSources } from './catalog/sources'
import { formatReportMarkdown, syncCatalog } from './catalog/sync'

// bun run sync:catalog [--db catalog.db] [--out catalog.db] [--discovery discovery.db] [--full]
//   [--sources skills-sh,clawhub,skillhub,mcp-registry,github-skills,builtin-providers] [--min-ratio 0.8]
//   [--report-json report.json] [--report-md report.md] [--finds-url https://…/api/discovery/export]
// Reads the previous catalog from --db when it exists, syncs into a copy and
// moves the copy to --out. Exits 2 without writing --out when the result has
// fewer than --min-ratio of the previous available resources. With --discovery,
// the skill directories are read into that file (updated the same way) and pick
// the GitHub repos github-skills scans; without it github-skills rescans the repos
// the catalog already holds. With --finds-url, what the API's search lookups found is
// read from that URL into --discovery first, so found repos join the scan queue.
const { values } = parseArgs({
  options: {
    db: { type: 'string', default: 'catalog.db' },
    discovery: { type: 'string' },
    out: { type: 'string' },
    full: { type: 'boolean', default: false },
    sources: { type: 'string' },
    'min-ratio': { type: 'string', default: '0.8' },
    'report-json': { type: 'string' },
    'report-md': { type: 'string' },
    'finds-url': { type: 'string' },
  },
})

const input = values.db!
const output = values.out ?? input
const minRatio = Number(values['min-ratio'])
const all = defaultSources()
const allDiscovery = defaultDiscoverySources()
const names = [...allDiscovery, ...all].map((s) => s.name)
const wanted = values.sources?.split(',').map((s) => s.trim()).filter(Boolean)
const unknown = wanted?.filter((w) => !names.includes(w)) ?? []
if (unknown.length) {
  console.error(`unknown source(s): ${unknown.join(', ')}; known: ${names.join(', ')}`)
  process.exit(1)
}
const sources = wanted ? all.filter((s) => wanted.includes(s.name)) : all
const discoverySources = wanted ? allDiscovery.filter((s) => wanted.includes(s.name)) : allDiscovery

const work = `${output}.sync-${process.pid}.tmp`
rmSync(work, { force: true })
// The previous file is never edited in place: a failed or guarded run leaves it intact.
if (existsSync(input)) copyFileSync(input, work)

const db = openCatalogForWrite(work)

const discoveryPath = values.discovery
const discoveryWork = discoveryPath ? `${discoveryPath}.sync-${process.pid}.tmp` : null
if (discoveryPath && discoveryWork) {
  rmSync(discoveryWork, { force: true })
  if (existsSync(discoveryPath)) copyFileSync(discoveryPath, discoveryWork)
}
const discoveryDb = discoveryWork ? openDiscoveryForWrite(discoveryWork) : null
const github = new Octokit({
  auth: process.env['GITHUB_TOKEN'] || undefined,
  userAgent: 'agent-store-catalog-sync',
  // Failed requests (a removed repo's 404) are counted in the report; per-request lines only add noise.
  log: { debug: () => {}, info: () => {}, warn: console.warn, error: () => {} },
})
const report = await syncCatalog(db, {
  sources,
  fetch,
  github,
  full: values.full,
  // GraphQL has no anonymous access; without a token the previous stars stay.
  stars: process.env['GITHUB_TOKEN'] ? {} : false,
  ...(discoveryDb
    ? { discovery: { db: discoveryDb, sources: discoverySources, ...(values['finds-url'] ? { findsUrl: values['finds-url'] } : {}) } }
    : {}),
  log: (m) => console.error(m),
})
const after = countAvailable(db)
db.exec('VACUUM')
db.close()
discoveryDb?.exec('VACUUM')
discoveryDb?.close()

const guardFailed = report.before.available > 0 && after < report.before.available * minRatio
const note = guardFailed
  ? [`**Not published**: ${after} available is below ${minRatio} × ${report.before.available} (the previous catalog).`]
  : []
const markdown = formatReportMarkdown(report, note)
if (values['report-json']) writeFileSync(values['report-json'], JSON.stringify({ ...report, guardFailed }, null, 2))
if (values['report-md']) writeFileSync(values['report-md'], markdown)
console.log(markdown)

if (guardFailed) {
  rmSync(work, { force: true })
  if (discoveryWork) rmSync(discoveryWork, { force: true })
  process.exit(2)
}
renameSync(work, output)
if (discoveryPath && discoveryWork) renameSync(discoveryWork, discoveryPath)
