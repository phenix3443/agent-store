import { useT } from '../../i18n'
import { syncState, type SyncState } from '../../lib/backup'
import { useNavigate } from '../../lib/useNavigate'
import { useAppState } from '../../state/AppState'
import { useBackup } from '../../state/Backup'
import { cn } from '../ui/cn'

const DOT: Record<SyncState, string> = {
  syncing: 'as-spin border border-fg-3 border-t-transparent',
  error: 'bg-bad',
  blocked: 'bg-bad',
  conflict: 'bg-warn',
  pending: 'bg-fg-2',
  remote: 'bg-fg-2',
  synced: 'bg-provider',
  never: 'border border-fg-3',
}

/** Status bar: the backup's state at a glance, only once this machine is connected. Opens 设置 › 备份与同步. */
export function BackupIndicator() {
  const t = useT()
  const backup = useBackup()
  const navigate = useNavigate()
  const { setSettingsTab } = useAppState()
  const status = backup?.status
  if (!backup || !status || !status.connected) return null
  const state = syncState(status, { running: backup.autoRunning || backup.busy === 'now' || backup.busy === 'pull', error: !!backup.autoError })
  const label = t('bk.indicator').replace('{0}', t(`bk.state.${state}`))
  return (
    <button
      type="button"
      title={t('bk.indicatorTitle')}
      onClick={() => {
        navigate('settings')
        setSettingsTab('backup')
      }}
      className={cn('flex h-[26px] flex-none items-center gap-1.5 hover:text-fg', (state === 'error' || state === 'blocked') && 'text-bad', state === 'conflict' && 'text-warn')}
    >
      <i aria-hidden className={cn('inline-block h-1.5 w-1.5 flex-none rounded-full', DOT[state])} />
      {label}
    </button>
  )
}
