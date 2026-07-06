import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/next'
import { ClientStateProvider } from '@/components/ClientStateProvider'
import { Header } from '@/components/Header'
import { getCurrentUser } from '@/lib/auth'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'AI Agent Store',
  description: 'Discover and install AI providers, skills, and MCP servers',
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
    <html lang={locale} className={`${inter.variable} ${jetbrainsMono.variable}`} data-theme="dark">
      <body className="min-h-screen bg-store-content text-store-text antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ClientStateProvider>
            <div className="flex min-h-screen flex-col">
              <Header user={user} />
              <div className="flex-1">{children}</div>
            </div>
            {drawer}
          </ClientStateProvider>
        </NextIntlClientProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}
