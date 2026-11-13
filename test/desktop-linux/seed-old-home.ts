// Writes what an Agent Store from before 2026-11-12 left in ~/.agents for one
// installed skill: the store copy with its marker, the registry entry (on for
// both tools: Codex read ~/.agents/skills itself) and the Claude symlink. Also a
// skill another tool put in ~/.agents/skills, which the migration must leave alone.
// Usage: bun test/desktop-linux/seed-old-home.ts <home>
import { mkdirSync, symlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { contentHash, MARKER } from '../../apps/client-core/src/skills/store'

const home = process.argv[2]
if (!home) throw new Error('usage: seed-old-home.ts <home>')
const agents = join(home, '.agents')
const dir = join(agents, 'skills', 'legacy-skill')
mkdirSync(join(dir, 'references'), { recursive: true })
writeFileSync(join(dir, 'SKILL.md'), '---\nname: legacy-skill\ndescription: Installed by an older Agent Store\n---\nRead references/notes.md.\n')
writeFileSync(join(dir, 'references', 'notes.md'), 'moved, not copied twice\n')
const manifest = {
  id: 'legacy-skill', slug: 'legacy-skill', name: 'legacy-skill', description: 'Installed by an older Agent Store',
  category: 'skill', version: '1.0.0', publisher: { id: 'p', slug: 'p', name: 'someone', avatarUrl: '', tier: 'community' },
  compatibleWith: ['claude', 'codex'], tags: [], downloads: 0, status: 'published',
  installHook: { steps: [] }, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', contentUrl: '',
}
const marker = {
  slug: 'legacy-skill', version: '1.0.0', source: null, contentHash: await contentHash(dir),
  runtimeNames: { claude: 'legacy-skill', codex: 'legacy-skill' }, manifest,
}
writeFileSync(join(dir, MARKER), JSON.stringify(marker, null, 2))
writeFileSync(join(agents, 'registry.json'), JSON.stringify({ installed: [{
  slug: 'legacy-skill', category: 'skill', version: '1.0.0', installedAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z', compatibleWith: ['claude', 'codex'], enabledFor: { codex: true, claude: true },
}] }, null, 2))
mkdirSync(join(home, '.claude', 'skills'), { recursive: true })
symlinkSync(dir, join(home, '.claude', 'skills', 'legacy-skill'), 'dir')

const users = join(agents, 'skills', 'users-own')
mkdirSync(users, { recursive: true })
writeFileSync(join(users, 'SKILL.md'), '---\nname: users-own\ndescription: Another tool put this here\n---\n')
