import { useEffect, useState } from 'react'

export const NARROW_QUERY = '(max-width: 1040px)'

export function useMediaQuery(query: string): boolean {
  const get = () => {
    try {
      return window.matchMedia(query).matches
    } catch {
      return false
    }
  }
  const [matches, setMatches] = useState(get)
  useEffect(() => {
    let mql: MediaQueryList
    try {
      mql = window.matchMedia(query)
    } catch {
      return
    }
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}
