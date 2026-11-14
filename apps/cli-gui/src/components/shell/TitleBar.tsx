import { Minus, Search, Square, X } from 'lucide-react'
import { useT } from '../../i18n'
import { useAppState } from '../../state/AppState'
import { isMacPlatform, modKeyLabel } from '../../lib/nav'
import { Kbd } from '../ui/badge'
import { Logo } from '../ui/icons'

async function getWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  return getCurrentWindow()
}

const close = () => void getWindow().then((w) => w.close())
const minimize = () => void getWindow().then((w) => w.minimize())
const toggleMaximize = () => void getWindow().then((w) => w.toggleMaximize())

function MacLights() {
  const t = useT()
  const lights: [string, () => void, string][] = [
    ['window.close', close, '#ff5f57'],
    ['window.minimize', minimize, '#febc2e'],
    ['window.maximize', toggleMaximize, '#28c840'],
  ]
  return (
    <div className="flex w-[60px] gap-2 pl-0.5">
      {lights.map(([key, onClick, color]) => (
        <button key={key} type="button" aria-label={t(key)} title={t(key)} onClick={onClick} className="h-3 w-3 rounded-full" style={{ background: color }} />
      ))}
    </div>
  )
}

function WindowControls() {
  const t = useT()
  return (
    <div className="-mr-3 ml-auto flex h-11">
      <button type="button" aria-label={t('window.minimize')} title={t('window.minimize')} onClick={minimize} className="grid h-11 w-[46px] place-items-center text-fg-2 hover:bg-panel-2 hover:text-fg">
        <Minus size={13} />
      </button>
      <button type="button" aria-label={t('window.maximize')} title={t('window.maximize')} onClick={toggleMaximize} className="grid h-11 w-[46px] place-items-center text-fg-2 hover:bg-panel-2 hover:text-fg">
        <Square size={11} />
      </button>
      <button type="button" aria-label={t('window.close')} title={t('window.close')} onClick={close} className="grid h-11 w-[46px] place-items-center text-fg-2 hover:bg-[#e5484d] hover:text-white">
        <X size={14} />
      </button>
    </div>
  )
}

export function TitleBar() {
  const t = useT()
  const { setPaletteOpen } = useAppState()
  const mac = isMacPlatform()
  return (
    <header
      data-tauri-drag-region
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) toggleMaximize()
      }}
      className="relative flex h-11 flex-none select-none items-center gap-3 border-b border-line bg-white/[0.025] px-3"
    >
      {mac && <MacLights />}
      <div data-tauri-drag-region className="flex items-center gap-2 text-[12.5px] font-bold text-fg-2">
        <Logo />
        <span data-tauri-drag-region className="max-[1040px]:hidden">Agent Store</span>
      </div>
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="absolute left-1/2 flex h-7 w-[min(380px,40%)] -translate-x-1/2 items-center gap-2 rounded-lg border border-line bg-black/25 pl-2.5 pr-1.5 text-[12.5px] text-fg-3 transition-colors hover:border-line-strong hover:text-fg-2"
      >
        <Search size={14} className="flex-none" />
        <span className="flex-1 truncate text-left">{t('shell.search')}</span>
        <Kbd>{modKeyLabel()} K</Kbd>
      </button>
      {!mac && <WindowControls />}
    </header>
  )
}
