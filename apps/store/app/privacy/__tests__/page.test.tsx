import { afterEach, expect, mock, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'

let locale = 'zh'

mock.module('next-intl/server', () => ({
  getLocale: async () => locale,
}))
mock.module('next-intl', () => ({
  useLocale: () => locale,
}))

afterEach(() => cleanup())

const { default: PrivacyPage } = await import('../page')

async function renderPrivacy(nextLocale: string) {
  locale = nextLocale
  const view = render(await PrivacyPage())
  return view.container.textContent ?? ''
}

test('Chinese privacy policy discloses actual processors, data and deletion path', async () => {
  const text = await renderPrivacy('zh')

  expect(screen.getByRole('article')).toHaveAttribute('lang', 'zh-CN')
  for (const processor of ['Neon', 'Cloudflare', 'Vercel', 'GitHub', 'Google', 'Waffo']) {
    expect(text).toContain(processor)
  }
  for (const fact of ['评价', '订单 ID', 'provider', 'token', '状态码', '延迟', '30 天', 'us-east-1']) {
    expect(text).toContain(fact)
  }
  expect(text).toContain('人工')
  expect(text).toContain('商户审核已通过')
  expect(text).toContain('测试模式')
  expect(text).not.toContain('商户审批与配置阶段')
  expect(text).not.toContain('跨设备同步')
  expect(screen.getByRole('link', { name: 'agent-store@panghuli.tech' })).toHaveAttribute(
    'href',
    'mailto:agent-store@panghuli.tech',
  )
})

test('English privacy policy renders alone and makes no cloud-sync claim', async () => {
  const text = await renderPrivacy('en')

  expect(screen.getByRole('article')).toHaveAttribute('lang', 'en')
  expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
  expect(text).toContain('manual')
  expect(text).toContain('us-east-1')
  expect(text).toContain('merchant review is complete')
  expect(text).toContain('test mode')
  expect(text).not.toContain('pending merchant approval')
  expect(text).not.toContain('cross-device sync')
  expect(text).not.toContain('隐私政策')
})
