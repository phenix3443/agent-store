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
    name: 'filesystem', description: 'desc',
    publisher, tags: ['fs', 'io'], downloads: 388000, installed: true,
    ...overrides,
  } as SelectedDetail
}

test('shows install info (标识 / 版本 / 更新时间) for an installed item', () => {
  render(<InfoSidebar detail={installedDetail()} />)
  expect(screen.getByText('安装信息')).toBeInTheDocument()
  expect(screen.getByText('filesystem')).toBeInTheDocument()
  expect(screen.getByText('v0.8.1')).toBeInTheDocument()
  expect(screen.getByText('更新时间')).toBeInTheDocument()
})

test('always shows the 市场 section, even for an installed item', () => {
  render(<InfoSidebar detail={installedDetail()} />)
  expect(screen.getByText('市场')).toBeInTheDocument()
  expect(screen.getByText('发布')).toBeInTheDocument()
  expect(screen.getByText('最近发布')).toBeInTheDocument()
})

test('分类 section prepends the category type label as the first chip before the tags', () => {
  render(<InfoSidebar detail={installedDetail()} />)
  expect(screen.getByText('MCP')).toBeInTheDocument()
  expect(screen.getByText('fs')).toBeInTheDocument()
  expect(screen.getByText('io')).toBeInTheDocument()
})

test('资源 section links to the real Store page for an mcp item', () => {
  render(<InfoSidebar detail={installedDetail({ resourceId: 'mcp-registry:io.example/filesystem' })} />)
  expect(screen.getByText('资源')).toBeInTheDocument()
  expect(screen.getByText('Store 页面')).toBeInTheDocument()
  expect(screen.queryByText('官网 / 文档')).not.toBeInTheDocument()
  expect(screen.queryByText('源码仓库 (GitHub)')).not.toBeInTheDocument()
})

test('资源 section links to the real Store page for a provider item', () => {
  render(<InfoSidebar detail={installedDetail({ category: 'provider', resourceId: 'builtin:openrouter' })} />)
  expect(screen.getByText('Store 页面')).toBeInTheDocument()
  expect(screen.queryByText('官网 / 文档')).not.toBeInTheDocument()
})

test('shows the 市场 section for a not-yet-installed catalog item too', () => {
  render(
    <InfoSidebar
      detail={{
        id: 'i1', slug: 'filesystem', name: 'filesystem', description: 'desc',
 category: 'mcp', version: '0.8.1', publisher,
        compatibleWith: ['claude'], tags: [], downloads: 10, status: 'published',
        installHook: { steps: [] }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
        configSchema: {}, installed: false, transport: 'stdio', serverCommand: './server',
      } as unknown as SelectedDetail}
    />
  )
  expect(screen.getByText('市场')).toBeInTheDocument()
})

test('an install from before /api/resources has no catalog id, so no Store page link and no empty 资源 section', () => {
  render(<InfoSidebar detail={installedDetail()} />)
  expect(screen.queryByText('Store 页面')).not.toBeInTheDocument()
  expect(screen.queryByText('资源')).not.toBeInTheDocument()
})

test('a catalog skill shows its id, its tree version as it is, and links to its source repo and homepage', () => {
  render(
    <InfoSidebar
      detail={{
        ...installedDetail({ category: 'skill', version: 'ebd5b1afb600', resourceId: 'github:obra/superpowers/brainstorming' }),
        installed: false,
        resource: { kind: 'skill', origin: { site: 'github' }, repo: { url: 'https://github.com/obra/superpowers/tree/c/skills/brainstorming' }, homepageUrl: 'https://github.com/obra/superpowers' },
      } as unknown as SelectedDetail}
    />
  )
  expect(screen.getByText('github:obra/superpowers/brainstorming')).toBeInTheDocument()
  expect(screen.getByText('ebd5b1afb600')).toBeInTheDocument()
  expect(screen.getByText('源码仓库')).toBeInTheDocument()
  expect(screen.getByText('主页')).toBeInTheDocument()
  expect(screen.getByText('GitHub')).toBeInTheDocument()
})
