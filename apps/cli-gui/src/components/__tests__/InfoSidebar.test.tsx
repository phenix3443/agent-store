import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import { InfoSidebar } from '../InfoSidebar'
import type { SelectedDetail } from '../../lib/useSelectedDetail'

afterEach(() => cleanup())

const publisher = { id: 'p', slug: 'anthropic', name: 'anthropic', avatarUrl: '', tier: 'official' as const }

function installedDetail(overrides: Partial<SelectedDetail> = {}): SelectedDetail {
  return {
    slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: {},
    name: 'filesystem', description: 'desc', readmeUrl: 'https://docs.example.com', icon: '',
    publisher, tags: ['fs', 'io'], downloads: 388000, installed: true,
    ...overrides,
  } as SelectedDetail
}

test('shows install info, tags and resource links for an installed item', () => {
  render(<InfoSidebar detail={installedDetail()} />)
  expect(screen.getByText('安装信息')).toBeInTheDocument()
  expect(screen.getByText('filesystem')).toBeInTheDocument()
  expect(screen.getByText('v0.8.1')).toBeInTheDocument()
  expect(screen.getByText('fs')).toBeInTheDocument()
  expect(screen.getByText('io')).toBeInTheDocument()
  expect(screen.getByText('官网 / 文档')).toBeInTheDocument()
  expect(screen.queryByText('市场')).not.toBeInTheDocument()
})

test('shows the 市场 section (published/updated) for a not-yet-installed catalog item', () => {
  render(
    <InfoSidebar
      detail={{
        id: 'i1', slug: 'filesystem', name: 'filesystem', description: 'desc',
        readmeUrl: '', icon: '', category: 'mcp', version: '0.8.1', publisher,
        compatibleWith: ['claude'], tags: [], downloads: 10, rating: 4.5, status: 'published',
        installHook: { steps: [] }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
        configSchema: {}, installed: false, transport: 'stdio', serverCommand: './server',
      } as SelectedDetail}
    />
  )
  expect(screen.getByText('市场')).toBeInTheDocument()
})
