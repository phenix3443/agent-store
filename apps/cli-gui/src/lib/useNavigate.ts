import { useCallback } from 'react'
import { useAppState } from '../state/AppState'
import { sectionTarget, type Section } from './nav'

export function useNavigate() {
  const { setNavView, setCategoryFilter } = useAppState()
  return useCallback(
    (section: Section) => {
      const { view, category } = sectionTarget(section)
      if (category) setCategoryFilter(category)
      setNavView(view)
    },
    [setNavView, setCategoryFilter]
  )
}
