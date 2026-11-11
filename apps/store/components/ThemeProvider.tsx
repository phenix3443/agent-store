'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      storageKey="aas-store-theme"
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
