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
  { name: 'supplement-offer-results', path: '/store?state=results&q=pdf&supplement=offer' },
  { name: 'supplement-searching', path: '/store?state=empty&q=pdf%20tools&supplement=searching' },
  { name: 'supplement-found', path: '/store?state=empty&q=pdf%20tools&supplement=found' },
  { name: 'supplement-none', path: '/store?state=empty&q=pdf%20tools&supplement=none' },
  { name: 'supplement-unavailable', path: '/store?state=empty&q=pdf%20tools&supplement=unavailable' },
  { name: 'detail', path: DETAIL },
  { name: 'detail-mcp', path: '/store/mcp/mcp-registry:com.browser-use/browser-use' },
  { name: 'detail-provider', path: '/store/provider/builtin:openrouter' },
  { name: 'detail-missing', path: '/store/skill/github:nobody/nothing/none', status: 404 },
  // The drawer only opens from the list (an intercepted route).
  { name: 'drawer', path: '/store?category=skill', click: 'a[data-item-link]' },
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
  // Signed out, a heart opens the log-in dialog with its own reason.
  { name: 'login-favorite', path: '/store?category=skill', press: 'button[data-favorite]', wait: '[role="dialog"]', viewport: true },
]
// Signed-in pages, one demo session per plan (ci-demo-session.mjs, SHOT_SESSIONS).
const SESSIONS = JSON.parse(process.env.SHOT_SESSIONS || '{}')
const SIGNED_IN = [
  { name: 'dashboard', plan: 'free', path: '/dashboard' },
  { name: 'dashboard-free', plan: 'free', path: '/dashboard?tab=subscription' },
  { name: 'dashboard-pro', plan: 'pro', path: '/dashboard?tab=subscription' },
  { name: 'dashboard-canceling', plan: 'canceling', path: '/dashboard?tab=subscription' },
  { name: 'dashboard-canceled', plan: 'canceled', path: '/dashboard?tab=subscription' },
  { name: 'dashboard-loading', plan: 'pro', path: '/dashboard?tab=subscription&state=loading' },
  { name: 'dashboard-error', plan: 'pro', path: '/dashboard?tab=subscription&state=error' },
  // Only opens the confirmation; nothing is sent until its second button.
  { name: 'dashboard-cancel-confirm', plan: 'pro', path: '/dashboard?tab=subscription', click: 'button[data-subscription-cancel]', opens: '[role="alertdialog"]', viewport: true },
  { name: 'account-menu', plan: 'free', path: '/docs', click: 'header button[aria-haspopup="menu"]', opens: '[role="menu"]', minWidth: 1024 },
  // The CI proxy starts the pro user with three favorites, including DETAIL.
  { name: 'dashboard-favorites', plan: 'pro', path: '/dashboard?tab=favorites' },
  { name: 'dashboard-favorites-empty', plan: 'free', path: '/dashboard?tab=favorites' },
  { name: 'detail-favorited', plan: 'pro', path: DETAIL, wait: 'button[data-favorite][aria-pressed="true"]' },
  { name: 'store-signed-in', plan: 'pro', path: '/store?category=skill', wait: 'button[data-favorite]:not([aria-disabled])' },
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
        const res = await page.goto(base + p.path, { waitUntil: p.waitUntil ?? 'networkidle', timeout: 60_000 })
        if (!res || res.status() !== (p.status ?? 200)) throw new Error(`HTTP ${res?.status()}`)
        if (p.press) await page.locator(p.press).first().click()
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
          await pg.locator(p.opens).waitFor({ timeout: 10_000 })
        } else if (p.wait) await pg.locator(p.wait).first().waitFor({ timeout: 30_000 })
        else if (!(await pg.locator('.dash').count())) throw new Error('not signed in')
        await pg.evaluate(() => document.fonts.ready)
        await pg.screenshot({ path: file, fullPage: !p.click && !p.viewport })
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
