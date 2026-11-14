import { useEffect } from 'react'
import { useAppState } from '../state/AppState'
import { SECTIONS } from './nav'
import { useNavigate } from './useNavigate'

function isTyping(el: Element | null): boolean {
  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || (el as HTMLElement).isContentEditable)
}

/** Window-wide keys. Escape and focus trapping belong to the Radix dialogs and menus. */
export function useShortcuts() {
  const { setPaletteOpen, setShellDialog } = useAppState()
  const navigate = useNavigate()

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const mod = ev.metaKey || ev.ctrlKey
      const key = ev.key.toLowerCase()
      if (mod && key === 'k') {
        ev.preventDefault()
        setPaletteOpen((open) => !open)
        return
      }
      // A dialog or menu is open: its own keys win.
      if (document.querySelector('[role="dialog"], [role="menu"]')) return
      if (mod && /^[1-6]$/.test(key)) {
        ev.preventDefault()
        navigate(SECTIONS[Number(key) - 1].id)
        return
      }
      if (mod && key === ',') {
        ev.preventDefault()
        navigate('settings')
        return
      }
      if (mod || ev.altKey || isTyping(document.activeElement)) return
      if (ev.key === '/') {
        const field = document.querySelector<HTMLInputElement>('[data-page-search]')
        if (field) {
          ev.preventDefault()
          field.focus()
          field.select()
        }
      } else if (ev.key === '?') {
        ev.preventDefault()
        setShellDialog('shortcuts')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, setPaletteOpen, setShellDialog])
}
