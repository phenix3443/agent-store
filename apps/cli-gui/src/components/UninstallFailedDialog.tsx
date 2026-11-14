import { useT } from '../i18n'
import { ErrorDetail } from './ConfigParts'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'

export interface UninstallFailure {
  slug: string
  message: string
  /** The engine's own text, behind 详细信息. */
  detail?: string
  /** `uninstall --force` would get past this error. */
  forceable: boolean
}

// Same frame as InstallLinkDialog's notice.
export function UninstallFailedDialog({
  failure,
  onClose,
  onForce,
}: {
  failure: UninstallFailure | null
  onClose: () => void
  onForce: (slug: string) => void
}) {
  const t = useT()
  return (
    <Dialog open={failure !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined} layer="top">
        <DialogBody>
          <DialogTitle>{t('policy.uninstallFailed')}</DialogTitle>
          {failure && (
            <>
              <p className="mt-3 break-all rounded-lg border border-store-border bg-store-term-bg px-3 py-2 font-mono text-xs text-store-text-2">
                {failure.slug}
              </p>
              <p className="mt-2 break-words text-xs text-store-red">{failure.message}</p>
              <ErrorDetail detail={failure.detail} />
              {failure.forceable && (
                <p className="mt-3 text-sm leading-relaxed text-store-text-2">{t('policy.forceHint')}</p>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>{failure?.forceable ? t('common.cancel') : t('policy.close')}</Button>
          {failure?.forceable && (
            <Button variant="danger" onClick={() => onForce(failure.slug)}>
              {t('policy.forceUninstall')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
