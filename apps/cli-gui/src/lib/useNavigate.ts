import { useCallback } from 'react'
import { useAppState } from '../state/AppState'
import { sectionTarget, type Section } from './nav'

/** Switches section and drops the selection: Discover selects catalog ids, the libraries installed slugs. */
export function useNavigate() {
  const { setNavView, setCategoryFilter, setSelectedSlug, setEditingConfigSlug } = useAppState()
  return useCallback(
    (section: Section) => {
      const { view, category } = sectionTarget(section)
      if (category) setCategoryFilter(category)
      setNavView(view)
      setSelectedSlug(null)
      setEditingConfigSlug(null)
    },
    [setNavView, setCategoryFilter, setSelectedSlug, setEditingConfigSlug]
  )
}
