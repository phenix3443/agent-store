import type { Metadata } from 'next'
import { Schibsted_Grotesk, JetBrains_Mono } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/next'
import { ClientStateProvider } from '@/components/ClientStateProvider'
import { Header } from '@/components/Header'
import { InstallNoticeProvider } from '@/components/InstallNotice'
import { SkipLink } from '@/components/SkipLink'
import { ThemeProvider } from '@/components/ThemeProvider'
import { getCurrentUser } from '@/lib/auth'
import './globals.css'

const grotesk = Schibsted_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://agent-store-alpha.vercel.app'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Agent Store — skills, MCP servers & providers for Claude Code / Codex',
    template: '%s · Agent Store',
  },
  description:
    '一个入口，装齐所有 Agent 能力。发现并一键安装 Claude Code / Codex 的技能、MCP 服务器与模型供应商，本地代理统一转发、自动降级。',
  openGraph: {
    type: 'website',
    siteName: 'Agent Store',
    url: SITE_URL,
    title: 'Agent Store — skills, MCP servers & providers for AI coding agents',
    description: '发现并一键安装 Claude Code / Codex 的技能、MCP 与供应商。',
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
    <html lang={locale} className={`${grotesk.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>
            <ClientStateProvider>
              <InstallNoticeProvider>
              <SkipLink />
              <div className="flex min-h-screen flex-col">
                <Header user={user} />
                <main id="main" tabIndex={-1} className="flex-1 outline-none">
                  {children}
                </main>
              </div>
              {drawer}
              </InstallNoticeProvider>
            </ClientStateProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}
