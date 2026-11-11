'use client'

import * as Toast from '@radix-ui/react-toast'
import { createContext, useCallback, useContext, useState } from 'react'
import { useTranslations } from 'next-intl'

interface Notice {
  id: number
  command: string
  copied: boolean
}

let lastTouched = 0

/**
 * True while the visitor is pointing at or focusing the notice. The notice is
 * rendered outside the detail drawer, so the drawer asks this before treating
 * a click on it as "clicked outside, close".
 */
export function noticeInUse(): boolean {
  return performance.now() - lastTouched < 500
}

function touch() {
  lastTouched = performance.now()
}

const InstallNoticeContext = createContext<(notice: Omit<Notice, 'id'>) => void>(() => {})

/** Shown when the desktop client did not pick up an install link. */
export function useInstallNotice() {
  return useContext(InstallNoticeContext)
}

export function InstallNoticeProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('store.notice')
  const [notice, setNotice] = useState<Notice | null>(null)
  const show = useCallback((next: Omit<Notice, 'id'>) => setNotice({ ...next, id: Date.now() }), [])

  return (
    <InstallNoticeContext.Provider value={show}>
      <Toast.Provider label={t('label')} duration={20000} swipeDirection="right">
        {children}
        {notice && (
          <Toast.Root
            key={notice.id}
            type="foreground"
            onPointerDownCapture={touch}
            onFocusCapture={touch}
            onOpenChange={(open) => {
              if (!open) setNotice(null)
            }}
            className="pointer-events-auto border border-ink bg-plate p-4 shadow-[0_12px_28px_-12px_rgba(22,24,26,0.35)]"
          >
            <div className="flex items-start justify-between gap-4">
              <Toast.Title className="text-[15px] font-medium leading-6">{t('missingTitle')}</Toast.Title>
              <Toast.Close aria-label={t('close')} className="-mr-1.5 -mt-1 grid h-8 w-8 shrink-0 place-items-center hover:bg-sel">
                <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden>
                  <path d="m1.5 1.5 10 10M11.5 1.5l-10 10" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              </Toast.Close>
            </div>
            <Toast.Description className="mt-1 text-sm leading-[22px] text-ink-2">
              {notice.copied ? t('missingBody') : t('copyFailedBody')}
            </Toast.Description>
            <code className="mt-2.5 block overflow-x-auto whitespace-nowrap border border-line bg-paper px-3 py-2 font-mono text-[13px]">
              {notice.command}
            </code>
            <Toast.Action altText={t('downloadAlt')} asChild>
              {/* A route handler that redirects to the release assets, not a page. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/download/latest" className="btn mt-3 min-h-9">
                {t('download')}
              </a>
            </Toast.Action>
          </Toast.Root>
        )}
        <Toast.Viewport className="pointer-events-none fixed inset-x-4 bottom-4 z-[80] flex flex-col gap-2 outline-none sm:left-auto sm:right-6 sm:w-[400px]" />
      </Toast.Provider>
    </InstallNoticeContext.Provider>
  )
}
