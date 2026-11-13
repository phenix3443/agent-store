// Screenshots the web store's key pages for PR review (store-screenshots.yml).
// Usage: node scripts/store-screenshots.mjs <base-url> <out-dir>
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const [base = 'http://localhost:3000', out = 'shots'] = process.argv.slice(2)

const DETAIL = '/store/skill/github:vercel-labs/skills/find-skills'
const PAGES = [
  { name: 'landing', path: '/' },
  { name: 'download', path: '/download' },
  { name: 'store', path: '/store' },
  { name: 'mcp', path: '/store?category=mcp' },
  { name: 'search', path: '/store?q=github&category=mcp' },
  { name: 'detail', path: DETAIL },
  // The drawer only opens from the list (an intercepted route).
  { name: 'drawer', path: '/store', click: 'a[data-item-link]' },
]
const WIDTHS = [390, 820, 1440]
const THEMES = ['light', 'dark']
const LOCALES = ['zh', 'en']

const browser = await chromium.launch()
const failures = []
await mkdir(out, { recursive: true })

for (const locale of LOCALES) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, deviceScaleFactor: 1 })
      await context.addCookies([{ name: 'locale', value: locale, url: base }])
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (e) => errors.push(e.message))
      for (const p of PAGES) {
        const file = `${out}/${p.name}-${width}-${theme}-${locale}.png`
        try {
          const res = await page.goto(base + p.path, { waitUntil: 'networkidle', timeout: 60_000 })
          if (!res || res.status() >= 400) throw new Error(`HTTP ${res?.status()}`)
          if (p.click) {
            await page.locator(p.click).first().click()
            await page.locator('[data-item-drawer]').waitFor({ timeout: 30_000 })
            await page.waitForLoadState('networkidle')
          }
          await page.evaluate(() => document.fonts.ready)
          await page.screenshot({ path: file, fullPage: !p.click })
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
          if (overflow > 0) failures.push(`${file}: horizontal overflow ${overflow}px`)
          console.log(`ok ${file}`)
        } catch (e) {
          failures.push(`${file}: ${e.message}`)
        }
      }
      if (errors.length) failures.push(`${locale}/${theme}/${width}: page errors: ${errors.join(' | ')}`)
      await context.close()
    }
  }
}

await browser.close()
if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
