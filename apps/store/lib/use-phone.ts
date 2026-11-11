'use client'

import { useSyncExternalStore } from 'react'

// A narrow viewport or a touch-only device: neither can run the desktop client.
export const PHONE_QUERY = '(max-width: 767px), (hover: none) and (pointer: coarse)'

function subscribe(onChange: () => void) {
  const media = window.matchMedia(PHONE_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

export function usePhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false
  )
}
