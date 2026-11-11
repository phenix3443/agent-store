import { updateRegistry, upsertEntry } from '../../index'

const [aasHome, prefix, count] = process.argv.slice(2)
for (let i = 0; i < Number(count); i++) {
  const slug = `${prefix}-${i}`
  await updateRegistry(aasHome, async r => {
    // Widen the read-modify-write window so an unlocked writer would lose entries.
    await new Promise(resolve => setTimeout(resolve, 2))
    return upsertEntry(r, {
      slug, category: 'mcp', version: '1.0.0', installedAt: '', updatedAt: '',
      compatibleWith: ['claude'], enabledFor: {},
    })
  })
}
