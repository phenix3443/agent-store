'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type CopyState = 'idle' | 'copied' | 'failed'

export function useCopy(resetAfterMs = 2000) {
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = useCallback(
    async (text: string) => {
      let next: CopyState = 'copied'
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        next = 'failed'
      }
      setState(next)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setState('idle'), resetAfterMs)
      return next
    },
    [resetAfterMs]
  )

  return { state, copy }
}
