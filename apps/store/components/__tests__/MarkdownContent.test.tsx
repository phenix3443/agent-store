import { describe, test, expect, afterEach } from 'bun:test'
import { render, cleanup } from '@testing-library/react'
import { MarkdownContent } from '../MarkdownContent'

afterEach(() => {
  cleanup()
})

function renderMd(md: string) {
  return render(<MarkdownContent>{md}</MarkdownContent>).container
}

describe('MarkdownContent', () => {
  test('renders README header HTML instead of showing the tags as text', () => {
    const el = renderMd('<div align="center">\n  <img src="https://example.com/logo.png" alt="Anki MCP">\n</div>\n\n# Anki MCP Server')
    expect(el.textContent).not.toContain('<div')
    expect(el.textContent).not.toContain('<img')
    const img = el.querySelector('img')
    expect(img?.getAttribute('src')).toBe('https://example.com/logo.png')
    expect(img?.getAttribute('alt')).toBe('Anki MCP')
    expect(el.querySelector('div[align="center"]')).not.toBeNull()
  })

  test('drops script, iframe and style elements', () => {
    const el = renderMd('<script>window.pwned = 1</script>\n\n<iframe src="https://evil.example"></iframe>\n\n<style>body{display:none}</style>\n\ntext')
    expect(el.querySelector('script')).toBeNull()
    expect(el.querySelector('iframe')).toBeNull()
    expect(el.querySelector('style')).toBeNull()
    expect(el.textContent).toContain('text')
  })

  test('strips event handlers and javascript: URLs', () => {
    const el = renderMd(
      '<img src="https://example.com/a.png" onerror="alert(1)" alt="a">\n\n<a href="javascript:alert(1)" onclick="alert(2)">click</a>\n\n[md link](javascript:alert(3))'
    )
    for (const node of Array.from(el.querySelectorAll('*'))) {
      for (const attr of Array.from(node.attributes)) {
        expect(attr.name.startsWith('on')).toBe(false)
        expect(attr.value.toLowerCase()).not.toContain('javascript:')
      }
    }
  })

  test('drops images whose source is relative or not http(s)', () => {
    const el = renderMd('![rel](./docs/shot.png)\n\n<img src="data:image/svg+xml,<svg onload=alert(1)>">')
    expect(el.querySelector('img')).toBeNull()
  })

  test('keeps ordinary markdown', () => {
    const el = renderMd('## Install\n\n```sh\nnpx -y pkg\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |')
    expect(el.querySelector('h4')?.textContent).toBe('Install')
    expect(el.querySelector('pre code')?.textContent).toContain('npx -y pkg')
    expect(el.querySelectorAll('td').length).toBe(2)
  })
})
