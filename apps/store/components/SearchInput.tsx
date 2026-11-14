'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Search } from 'lucide-react'
import { useDebouncedCallback } from 'use-debounce'
import { useStoreQuery } from '@/lib/use-store-query'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** `page` is the wide search bar at the top of the store; `nav` the compact one elsewhere. */
export function SearchInput({
  className = '',
  variant = 'nav',
  ...rest
}: { className?: string; variant?: 'nav' | 'page'; 'data-nav-search'?: boolean }) {
  const page = variant === 'page'
  const t = useTranslations('store.search')
  const { setParams, isPending, searchParams, onStore } = useStoreQuery()
  const urlQuery = onStore ? (searchParams.get('q') ?? '') : ''
  const [value, setValue] = useState(urlQuery)
  const inputRef = useRef<HTMLInputElement>(null)
  // What this input last wrote to the URL, so an outside change (back button,
  // "clear filters") can be told apart from the echo of our own typing.
  const written = useRef(urlQuery)

  useEffect(() => {
    if (urlQuery !== written.current) {
      written.current = urlQuery
      setValue(urlQuery)
    }
  }, [urlQuery])

  const commit = useDebouncedCallback((next: string) => {
    written.current = next
    setParams({ q: next || null })
  }, 250)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)
      const cmdK = e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)
      if (!slash && !cmdK) return
      // A modal dialog owns the keyboard while it is open.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return
      e.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <form
      {...rest}
      data-store-search={page ? '' : undefined}
      role="search"
      action="/store"
      onSubmit={(e) => {
        e.preventDefault()
        commit(value.trim())
        commit.flush()
      }}
      className={
        page
          ? `searchbar ${className}`
          : `flex h-9 items-center gap-2 rounded-control border border-line bg-well pl-2.5 pr-1.5 text-fg-3 transition-[border-color,box-shadow] duration-200 hover:border-line-strong focus-within:border-mcp/70 focus-within:shadow-[0_0_0_4px_rgb(var(--mcp-rgb)/0.14)] ${className}`
      }
    >
      {isPending ? (
        <Loader2 size={page ? 20 : 15} aria-hidden className="shrink-0 animate-spin motion-reduce:animate-none" />
      ) : (
        <Search size={page ? 20 : 15} aria-hidden className="shrink-0" />
      )}
      <input
        ref={inputRef}
        type="search"
        name="q"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          // Elsewhere on the site the search only runs on Enter, so typing does not yank the page away.
          if (onStore) commit(e.target.value.trim())
        }}
        placeholder={t('placeholder')}
        aria-label={t('label')}
        aria-keyshortcuts="/ Meta+K Control+K"
        autoComplete="off"
        className={
          page
            ? undefined
            : 'h-full min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3 [&::-webkit-search-cancel-button]:appearance-none'
        }
      />
      <kbd title={t('shortcut')} className={page ? 'kbd hidden shrink-0 sm:!grid' : 'kbd hidden !h-[22px] shrink-0 text-[11px] sm:!grid'}>
        /
      </kbd>
      <span role="status" aria-live="polite" className="sr-only">
        {isPending ? t('loading') : ''}
      </span>
    </form>
  )
}
