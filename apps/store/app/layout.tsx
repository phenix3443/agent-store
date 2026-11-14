import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, Geist_Mono, Noto_Sans_SC } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/next'
import { Header } from '@/components/Header'
import { SiteFooter } from '@/components/SiteFooter'
import { InstallNoticeProvider } from '@/components/InstallNotice'
import { SkipLink } from '@/components/SkipLink'
import { getCurrentUser } from '@/lib/auth'
import { enabledLoginProviders } from '@/lib/auth/providers'
import './globals.css'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

// Only zh pages carry the class that defines --font-cjk: Simplified Chinese glyph
// shapes are wrong for ja/ko, which keep the system CJK font. preload is off because
// the font ships as unicode-range slices that load only for characters on the page.
const notoSansSC = Noto_Sans_SC({
  variable: '--font-cjk',
  display: 'swap',
  preload: false,
})

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://agent-store-alpha.vercel.app'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Agent Store: Everything your agents need',
    template: '%s · Agent Store',
  },
  description:
    'Agent 所需，尽在于此。7 万多个技能和 MCP，点一下装进你的 agent，不用再手改配置文件。已支持 Claude Code、Codex，更多 agent 陆续加入。',
  openGraph: {
    type: 'website',
    siteName: 'Agent Store',
    url: SITE_URL,
    title: 'Agent Store: Everything your agents need',
    description: '70,000+ skills and MCP servers, one click into your agents. Works with Claude Code and Codex today.',
  },
  twitter: { card: 'summary_large_image' },
}

export default async function RootLayout({
  children,
  drawer,
}: {
  children: React.ReactNode
  drawer: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()
  const user = await getCurrentUser()

  return (
    <html
      lang={locale}
      className={`${jakarta.variable} ${geistMono.variable} ${locale.startsWith('zh') ? notoSansSC.variable : ''}`}
    >
      <body className="min-h-screen bg-bg font-sans text-fg antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <InstallNoticeProvider>
            <SkipLink />
            <div className="relative isolate flex min-h-screen flex-col">
              <div aria-hidden className="aurora -z-10 !bottom-auto h-[760px]">
                <i />
                <i />
                <i />
              </div>
              <Header user={user} loginProviders={enabledLoginProviders()} />
              <main id="main" tabIndex={-1} className="flex-1 outline-none">
                {children}
              </main>
              <SiteFooter />
            </div>
            {drawer}
          </InstallNoticeProvider>
        </NextIntlClientProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}
