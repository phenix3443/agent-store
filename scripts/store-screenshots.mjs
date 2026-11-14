// Screenshots the web store's key pages for PR review (store-screenshots.yml).
// Usage: node scripts/store-screenshots.mjs <base-url> <out-dir>
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const [base = 'http://localhost:3000', out = 'shots'] = process.argv.slice(2)

const DETAIL = '/store/skill/github:vercel-labs/skills/find-skills'
const PAGES = [
  { name: 'landing', path: '/' },
  { name: 'client', path: '/client' },
  { name: 'pricing', path: '/pricing' },
  { name: 'download', path: '/download' },
  { name: 'store', path: '/store' },
  { name: 'skill', path: '/store?category=skill' },
  { name: 'mcp', path: '/store?category=mcp' },
  { name: 'provider', path: '/store?category=provider' },
  { name: 'search', path: '/store?q=github&category=mcp' },
  { name: 'search-empty', path: '/store?q=zzqx-no-such-package' },
  // Review states (?state=); the supplement is off on the test API, so its states come from here.
  { name: 'state-loading', path: '/store?state=loading' },
  { name: 'state-error', path: '/store?state=error' },
  { name: 'supplement-offer', path: '/store?state=empty&q=pdf%20tools&supplement=offer' },
  { name: 'supplement-searching', path: '/store?state=empty&q=pdf%20tools&supplement=searching' },
  { name: 'supplement-none', path: '/store?state=empty&q=pdf%20tools&supplement=none' },
  { name: 'supplement-unavailable', path: '/store?state=empty&q=pdf%20tools&supplement=unavailable' },
  { name: 'detail', path: DETAIL },
  { name: 'detail-mcp', path: '/store/mcp/mcp-registry:com.browser-use/browser-use' },
  { name: 'detail-provider', path: '/store/provider/builtin:openrouter' },
  { name: 'detail-missing', path: '/store/skill/github:nobody/nothing/none', status: 404 },
  // The drawer only opens from the list (an intercepted route).
  { name: 'drawer', path: '/store?category=skill', click: 'a[data-item-link]' },
]
// Interaction states of the store toolbar, on a filtered page so the clear link shows
// too. Viewport-only shots; the button rows show from 640px.
const SORT_PATH = '/store?q=github&category=mcp'
const SORT_STATES = [
  {
    // Tab from the search box: a real keyboard move, so :focus-visible matches.
    name: 'store-sortfocus',
    act: async (page) => {
      await page.locator('form[data-store-search] input').focus()
      await page.keyboard.press('Tab')
    },
  },
  { name: 'store-sorthover', act: (page) => page.getByRole('group').first().locator('button').nth(1).hover() },
]
// On a phone category and sort sit behind one button.
const SHEET = { name: 'store-filters', path: SORT_PATH, button: 'button[aria-haspopup="dialog"]', maxWidth: 639 }
// The narrow-screen nav menu; the bar shows the menu button below 1024px.
const MENU = { name: 'menu', path: '/store', button: 'header button[aria-expanded]', maxWidth: 1023 }
const WIDTHS = [390, 820, 1440]
const LOCALES = ['zh', 'en']

const browser = await chromium.launch()
const failures = []
await mkdir(out, { recursive: true })

for (const locale of LOCALES) {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: 'dark', deviceScaleFactor: 1 })
    await context.addCookies([{ name: 'locale', value: locale, url: base }])
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    for (const p of PAGES) {
      const file = `${out}/${p.name}-${width}-${locale}.png`
      try {
        const res = await page.goto(base + p.path, { waitUntil: 'networkidle', timeout: 60_000 })
        if (!res || res.status() !== (p.status ?? 200)) throw new Error(`HTTP ${res?.status()}`)
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
    for (const st of width > SHEET.maxWidth ? SORT_STATES : []) {
      const file = `${out}/${st.name}-${width}-${locale}.png`
      try {
        await page.goto(base + SORT_PATH, { waitUntil: 'networkidle', timeout: 60_000 })
        await page.evaluate(() => document.fonts.ready)
        await st.act(page)
        await page.screenshot({ path: file })
        await page.keyboard.press('Escape')
        console.log(`ok ${file}`)
      } catch (e) {
        failures.push(`${file}: ${e.message}`)
      }
    }
    if (width <= SHEET.maxWidth) {
      const file = `${out}/${SHEET.name}-${width}-${locale}.png`
      try {
        await page.goto(base + SHEET.path, { waitUntil: 'networkidle', timeout: 60_000 })
        await page.evaluate(() => document.fonts.ready)
        await page.locator(SHEET.button).first().click()
        await page.locator('[role="dialog"]').waitFor({ timeout: 10_000 })
        await page.screenshot({ path: file })
        console.log(`ok ${file}`)
      } catch (e) {
        failures.push(`${file}: ${e.message}`)
      }
    }
    if (width <= MENU.maxWidth) {
      const file = `${out}/${MENU.name}-${width}-${locale}.png`
      try {
        await page.goto(base + MENU.path, { waitUntil: 'networkidle', timeout: 60_000 })
        await page.evaluate(() => document.fonts.ready)
        await page.locator(MENU.button).click()
        await page.locator('[role="dialog"]').waitFor({ timeout: 10_000 })
        await page.screenshot({ path: file })
        console.log(`ok ${file}`)
      } catch (e) {
        failures.push(`${file}: ${e.message}`)
      }
    }
    if (errors.length) failures.push(`${locale}/${width}: page errors: ${errors.join(' | ')}`)
    await context.close()
  }
}

await browser.close()
if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
