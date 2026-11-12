import * as Dialog from '@radix-ui/react-dialog'
import { useT } from '../i18n'
import { ErrorDetail } from './ConfigParts'

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
    <Dialog.Root open={failure !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[70] flex max-h-[85vh] w-[480px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-store-border-strong bg-store-win shadow-2xl"
        >
          <div className="flex-1 overflow-y-auto p-6">
            <Dialog.Title className="text-base font-semibold text-store-text">{t('policy.uninstallFailed')}</Dialog.Title>
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
          </div>
          <div className="flex justify-end gap-2 border-t border-store-border px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-store-border-strong px-4 py-1.5 text-xs font-semibold text-store-text-2 hover:text-store-text"
            >
              {failure?.forceable ? t('common.cancel') : t('policy.close')}
            </button>
            {failure?.forceable && (
              <button
                type="button"
                onClick={() => onForce(failure.slug)}
                className="rounded-lg bg-store-red px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90"
              >
                {t('policy.forceUninstall')}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
