import { test, expect } from 'bun:test'
import { authorHref, leadSentence } from '../item-meta'
import { mcpItem, providerItem, skillItem } from '../../components/__tests__/fixtures'

test('lead sentence stops at the first sentence, not at a fixed length', () => {
  expect(
    leadSentence(
      'Creating algorithmic art using p5.js with seeded randomness. Use this when users request creating art using code, generative art, flow fields, or to avo'
    )
  ).toBe('Creating algorithmic art using p5.js with seeded randomness.')
  expect(leadSentence('Create art in .png and .pdf documents. You should use this skill when asked.')).toBe(
    'Create art in .png and .pdf documents.'
  )
})

test('lead sentence handles CJK punctuation and single-sentence text', () => {
  expect(leadSentence('OpenRouter：一个 API Key 访问 300+ 模型（OpenAI 兼容）。此预设已填好接入地址。')).toBe(
    'OpenRouter：一个 API Key 访问 300+ 模型（OpenAI 兼容）。'
  )
  expect(leadSentence('  Use when facing 2+ independent tasks  ')).toBe('Use when facing 2+ independent tasks')
  expect(leadSentence('')).toBe('')
})

test('author links point upstream, or nowhere when the item does not say', () => {
  expect(authorHref({ ...skillItem, source: { repo: 'obra/superpowers', ref: 'main', dir: 'skills/x' } })).toBe(
    'https://github.com/obra'
  )
  expect(
    authorHref({ ...skillItem, contentUrl: 'https://raw.githubusercontent.com/anthropics/skills/main/skills/x/SKILL.md' })
  ).toBe('https://github.com/anthropics')
  expect(authorHref({ ...mcpItem, name: 'io.github.ankimcp/anki-mcp-server' })).toBe('https://github.com/ankimcp')
  expect(authorHref({ ...mcpItem, name: 'com.biel/docs' })).toBe('https://biel.com')
  expect(authorHref(mcpItem)).toBeNull()
  expect(authorHref(providerItem)).toBeNull()
})
