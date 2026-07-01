import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'AI Agent Store',
  description: 'Discover and install AI providers, skills, and MCP servers',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} className={inter.variable} data-theme="dark">
      <body className="min-h-screen bg-ray-surface-0 text-ray-fg antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
