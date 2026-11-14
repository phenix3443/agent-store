import { SquareTerminal } from 'lucide-react'
import { useAppState } from '../../state/AppState'
import { useTerminalLog } from '../../state/TerminalLog'
import { useT } from '../../i18n'
import { cn } from '../ui/cn'
import { version as appVersion } from '../../../src-tauri/tauri.conf.json'

const LINE_COLOR = { default: '', green: 'text-provider', red: 'text-bad' } as const

export function StatusBar() {
  const t = useT()
  const { catalogOffline, setShellDialog } = useAppState()
  const { lines } = useTerminalLog()
  const last = lines[lines.length - 1]
  return (
    <footer className="flex h-[26px] flex-none items-center gap-3 border-t border-line bg-black/25 px-3 font-mono text-[11px] font-medium text-fg-3">
      <button
        type="button"
        title={t('shell.activityTitle')}
        onClick={() => setShellDialog('activity')}
        className="flex h-[26px] min-w-0 flex-1 items-center gap-1.5 hover:text-fg"
      >
        <SquareTerminal size={13} className="flex-none" />
        <span className={cn('block min-w-0 flex-1 truncate text-left', last && LINE_COLOR[last.color])}>
          {last ? last.text : t('shell.activityNone')}
        </span>
      </button>
      {catalogOffline !== null && (
        <span className="flex items-center gap-1.5">
          <i aria-hidden className={cn('inline-block h-1.5 w-1.5 rounded-full', catalogOffline ? 'bg-warn' : 'bg-provider')} />
          {catalogOffline ? t('shell.offline') : t('shell.online')}
        </span>
      )}
      <span>v{appVersion}</span>
    </footer>
  )
}
