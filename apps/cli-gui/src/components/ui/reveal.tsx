import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { revealPath } from '../../lib/reveal'
import { errorText } from '../../lib/rpc'
import { useT } from '../../i18n'
import { Button } from './button'
import { toast } from './toast'

/** 在文件管理器中显示: the path must be absolute and exist. */
export function RevealButton({ path, label, iconOnly, disabled }: { path: string; label?: string; iconOnly?: boolean; disabled?: boolean }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const text = t('reveal.btn')

  async function reveal() {
    if (busy) return
    setBusy(true)
    try {
      await revealPath(path)
      toast(t('reveal.done').replace('{0}', path))
    } catch (err) {
      toast.error(t('reveal.failed'), { description: errorText(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      size="sm"
      icon={iconOnly}
      aria-label={label ? `${text} · ${label}` : text}
      title={text}
      aria-busy={busy || undefined}
      disabled={disabled}
      onClick={() => void reveal()}
    >
      <FolderOpen />
      {!iconOnly && text}
    </Button>
  )
}
