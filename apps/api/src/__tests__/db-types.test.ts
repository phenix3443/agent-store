import { expect, test } from 'bun:test'
import type { SkillItem } from '@as/types'
import { mapItem, type DBItem, type DBPublisher } from '../db-types'
// Verbatim copy of skill/skills-canvas-design.json from phenix3443/registry @ 8c4a806.
import canvasDesign from './fixtures/registry-8c4a806-skills-canvas-design.json'

const now = new Date('2026-10-22T00:00:00Z')

function row(pkg: { slug: string; name: string; description: string; category: string; version: string; compatibleWith: string[]; tags: string[]; installHook: unknown; metadata: unknown }): DBItem & { publisher: DBPublisher } {
  return {
    id: 'item-1',
    slug: pkg.slug,
    name: pkg.name,
    description: pkg.description,
    category: pkg.category,
    version: pkg.version,
    publisherId: 'pub-1',
    compatibleWith: pkg.compatibleWith,
    tags: pkg.tags,
    downloads: 0,
    rating: '0',
    reviewCount: 0,
    status: 'published',
    installHook: pkg.installHook,
    metadata: pkg.metadata,
    createdAt: now,
    updatedAt: now,
    publisher: { id: 'pub-1', slug: 'anthropics', name: 'anthropics', avatarUrl: '', tier: 'official', bio: null, createdAt: now },
  }
}

function skillWithSource(source: unknown): SkillItem {
  return mapItem(row({ ...canvasDesign, metadata: { contentUrl: 'https://example.invalid/SKILL.md', source } })) as SkillItem
}

test('the real registry record maps to a directory source', () => {
  const item = mapItem(row(canvasDesign)) as SkillItem
  expect(item.category).toBe('skill')
  expect(item.source).toEqual({ repo: 'anthropics/skills', ref: 'main', dir: 'skills/canvas-design' })
  expect(item.contentUrl).toBe('https://raw.githubusercontent.com/anthropics/skills/main/skills/canvas-design/SKILL.md')
})

test('a directory path is kept, trailing slash and ./ dropped', () => {
  expect(skillWithSource({ repo: 'o/r', ref: 'v1', path: './skills/x/' }).source).toEqual({ repo: 'o/r', ref: 'v1', dir: 'skills/x' })
})

test('a root SKILL.md or an empty path means the repo root', () => {
  expect(skillWithSource({ repo: 'o/r', ref: 'main', path: 'SKILL.md' }).source?.dir).toBe('')
  expect(skillWithSource({ repo: 'o/r', ref: 'main', path: '' }).source?.dir).toBe('')
})

test('unsafe or malformed sources are omitted, not guessed', () => {
  for (const source of [
    { repo: 'o/r', ref: 'main', path: '../x/SKILL.md' },
    { repo: 'o/r', ref: 'main', path: 'skills/../../x' },
    { repo: 'o/r', ref: 'main', path: '/abs/x' },
    { repo: 'o/r', ref: 'main', path: 'skills\\x' },
    { repo: 'not-a-repo', ref: 'main', path: 'x' },
    { repo: 'o/r/extra', ref: 'main', path: 'x' },
    { repo: 'o/r', ref: '', path: 'x' },
    { repo: 'o/r', path: 'x' },
    { repo: 'o/r', ref: 'main' },
    'anthropics/skills',
    null,
  ]) {
    const item = skillWithSource(source)
    expect(item.source).toBeUndefined()
    expect('source' in item).toBe(false)
  }
})

test('skills without metadata.source have no source field', () => {
  const item = mapItem(row({ ...canvasDesign, metadata: { contentUrl: 'https://example.invalid/SKILL.md' } })) as SkillItem
  expect('source' in item).toBe(false)
})
