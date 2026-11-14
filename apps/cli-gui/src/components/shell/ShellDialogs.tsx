import { useAppState } from '../../state/AppState'
import { useTerminalLog } from '../../state/TerminalLog'
import { useT } from '../../i18n'
import { modKeyLabel } from '../../lib/nav'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogClose, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Kbd } from '../ui/badge'
import { EmptyState } from '../ui/states'
import { ProxyLogModal } from '../ProxyLogModal'
import { WelcomeDialog } from '../WelcomeDialog'
import { cn } from '../ui/cn'

const LINE_COLOR = { default: 'text-fg-2', green: 'text-provider', red: 'text-bad' } as const

function ShortcutsBody() {
  const t = useT()
  const m = modKeyLabel()
  const rows: [string, string][] = [
    [`${m} K`, 'keys.palette'],
    [`${m} 1 – 6`, 'keys.nav'],
    [`${m} ,`, 'keys.settings'],
    ['/', 'keys.search'],
    ['Esc', 'keys.esc'],
    ['Tab', 'keys.tab'],
    ['?', 'keys.help'],
  ]
  return (
    <table className="mt-2 w-full border-collapse text-[12.5px]">
      <tbody>
        {rows.map(([keys, label]) => (
          <tr key={label} className="border-b border-line last:border-b-0">
            <td className="whitespace-nowrap py-2 pr-4">
              <Kbd>{keys}</Kbd>
            </td>
            <td className="py-2 text-fg-2">{t(label)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ActivityBody() {
  const t = useT()
  const { lines } = useTerminalLog()
  if (lines.length === 0) return <EmptyState title={t('shell.activityNone')} body={t('shell.activityNoneDesc')} />
  return (
    <pre className="whitespace-pre-wrap break-all rounded-[9px] border border-line bg-code px-3 py-2.5 font-mono text-xs leading-[1.7]">
      {lines.map((line, i) => (
        <div key={i} className={cn(LINE_COLOR[line.color])}>
          {line.text}
        </div>
      ))}
    </pre>
  )
}

/** Dialogs any screen can open: from the palette, the status bar or a shortcut. */
export function ShellDialogs() {
  const t = useT()
  const { shellDialog, setShellDialog } = useAppState()
  const close = (open: boolean) => !open && setShellDialog(null)
  return (
    <>
      <Dialog open={shellDialog === 'shortcuts'} onOpenChange={close}>
        <DialogContent aria-describedby={undefined}>
          <DialogBody>
            <DialogTitle>{t('keys.title')}</DialogTitle>
            <ShortcutsBody />
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button>{t('ui.close')}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={shellDialog === 'activity'} onOpenChange={close}>
        <DialogContent width="wide">
          <DialogBody>
            <DialogTitle>{t('shell.activityTitle')}</DialogTitle>
            <DialogDescription>{t('shell.activityDesc')}</DialogDescription>
            <ActivityBody />
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button>{t('ui.close')}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ProxyLogModal open={shellDialog === 'requestLog'} onOpenChange={close} />
      <WelcomeDialog />
    </>
  )
}
