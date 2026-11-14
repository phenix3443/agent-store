import type { BackupSyncResult } from '@as/types'
import type { TFn } from '../../i18n'
import { useT } from '../../i18n'
import { errorText } from '../../lib/rpc'
import { describeBackupError } from '../../lib/backup'
import { useBackup } from '../../state/Backup'
import { useTerminalLog } from '../../state/TerminalLog'
import { toast } from '../ui/toast'

export function syncSummary(mode: 'now' | 'pull', r: BackupSyncResult, t: TFn): string {
  if (!r.uploaded.length && !r.applied.length) {
    return r.conflicts.length ? t('bk.resultConflicts').replace('{0}', String(r.conflicts.length)) : t('bk.resultNothing')
  }
  if (mode === 'pull') return t('bk.resultPull').replace('{0}', String(r.applied.length))
  return t('bk.resultNow').replace('{0}', String(r.uploaded.length)).replace('{1}', String(r.applied.length))
}

/** 立即备份 and 拉取 from the backup page and the command palette, logged like the CLI. */
export function useSyncAction() {
  const t = useT()
  const backup = useBackup()
  const { appendLine } = useTerminalLog()
  return async function run(mode: 'now' | 'pull', opts: { toast?: boolean } = {}): Promise<boolean> {
    if (!backup) return false
    appendLine(`$ aas backup ${mode}`)
    try {
      const r = await backup.sync(mode)
      const summary = syncSummary(mode, r, t)
      appendLine(`✓ ${summary}`, 'green')
      if (opts.toast) toast(summary)
      return true
    } catch (err) {
      appendLine(`✗ ${errorText(err)}`, 'red')
      if (opts.toast) toast.error(t('bk.failedWith').replace('{0}', t(`bk.failed.${mode}`)).replace('{1}', describeBackupError(err, t).message))
      return false
    }
  }
}
