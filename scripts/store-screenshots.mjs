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
  { name: 'detail', path: DETAIL },
  // The drawer only opens from the list (an intercepted route).
  { name: 'drawer', path: '/store', click: 'a[data-item-link]' },
  { name: 'docs', path: '/docs' },
  { name: 'docs-relay', path: '/docs/relay' },
  { name: 'docs-install', path: '/docs/install' },
  { name: 'privacy', path: '/privacy' },
  { name: 'terms', path: '/terms' },
  // Never reaches networkidle on the runner (page.goto timed out at 60s), so it waits for its heading instead.
  { name: 'notfound', path: '/no-such-page', status: 404, waitUntil: 'load', wait: 'h1' },
  // Signed out, the dashboard opens the log-in dialog over its gate. Viewport-only shots.
  { name: 'login', path: '/dashboard', wait: '[role="dialog"]', viewport: true },
  { name: 'login-failed', path: '/?error=auth_failed', wait: '[role="alert"]', viewport: true },
  { name: 'auth-desktop', path: '/auth/desktop', wait: '[role="status"] a', viewport: true },
]
// Signed-in pages, one demo session per plan (ci-demo-session.mjs, SHOT_SESSIONS).
const SESSIONS = JSON.parse(process.env.SHOT_SESSIONS || '{}')
const SIGNED_IN = [
  { name: 'dashboard', plan: 'free', path: '/dashboard' },
  { name: 'dashboard-free', plan: 'free', path: '/dashboard?tab=subscription' },
  { name: 'dashboard-pro', plan: 'pro', path: '/dashboard?tab=subscription' },
  { name: 'account-menu', plan: 'free', path: '/docs', click: 'header button[aria-haspopup="menu"]', minWidth: 1024 },
]
// Interaction states of the store toolbar's sort control, on a filtered page so the
// clear link shows too. Viewport-only shots.
const SORT_PATH = '/store?q=github&category=mcp'
const SORT_STATES = [
  {
    // Focus the last category tab, then Tab: a real keyboard move, so :focus-visible matches.
    name: 'store-sortfocus',
    act: async (page) => {
      await page.locator('[role="group"] button').last().focus()
      await page.keyboard.press('Tab')
    },
  },
  { name: 'store-sorthover', act: (page) => page.locator('select').first().hover() },
  // A mouse click opens the native list (not in the screenshot) and leaves mouse focus.
  { name: 'store-sortclick', act: (page) => page.locator('select').first().click() },
]
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
        const res = await page.goto(base + p.path, { waitUntil: p.waitUntil ?? 'networkidle', timeout: 60_000 })
        if (!res || (p.status ? res.status() !== p.status : res.status() >= 400)) throw new Error(`HTTP ${res?.status()}`)
        if (p.wait) await page.locator(p.wait).first().waitFor({ timeout: 30_000 })
        if (p.click) {
          await page.locator(p.click).first().click()
          await page.locator('[data-item-drawer]').waitFor({ timeout: 30_000 })
          await page.waitForLoadState('networkidle')
        }
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({ path: file, fullPage: !p.click && !p.viewport })
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        if (overflow > 0) failures.push(`${file}: horizontal overflow ${overflow}px`)
        console.log(`ok ${file}`)
      } catch (e) {
        failures.push(`${file}: ${e.message}`)
      }
    }
    for (const st of SORT_STATES) {
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

    for (const p of SIGNED_IN) {
      if (!SESSIONS[p.plan] || width < (p.minWidth ?? 0)) continue
      const file = `${out}/${p.name}-${width}-${locale}.png`
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: 'dark', deviceScaleFactor: 1 })
      await ctx.addCookies([
        { name: 'locale', value: locale, url: base },
        { name: 'better-auth.session_token', value: SESSIONS[p.plan], url: base, httpOnly: true },
      ])
      const pg = await ctx.newPage()
      try {
        const res = await pg.goto(base + p.path, { waitUntil: 'networkidle', timeout: 60_000 })
        if (!res || res.status() >= 400) throw new Error(`HTTP ${res?.status()}`)
        if (p.click) {
          await pg.locator(p.click).last().click()
          await pg.locator('[role="menu"]').waitFor({ timeout: 10_000 })
        } else if (!(await pg.locator('.dash').count())) throw new Error('not signed in')
        await pg.evaluate(() => document.fonts.ready)
        await pg.screenshot({ path: file, fullPage: !p.click })
        const overflow = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        if (overflow > 0) failures.push(`${file}: horizontal overflow ${overflow}px`)
        console.log(`ok ${file}`)
      } catch (e) {
        failures.push(`${file}: ${e.message}`)
      }
      await ctx.close()
    }
  }
}

await browser.close()
if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
