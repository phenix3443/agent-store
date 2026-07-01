import { useTerminalLog, type LineColor } from '../state/TerminalLog'

const COLOR_CLASS: Record<LineColor, string> = {
  default: 'text-store-text-2',
  green: 'text-store-green',
  red: 'text-store-red',
}

export function TerminalPane() {
  const { lines } = useTerminalLog()

  return (
    <div className="h-40 shrink-0 overflow-y-auto border-t border-store-border bg-black p-3 font-mono text-xs">
      {lines.map((line, i) => (
        <div key={i} data-terminal-line className={COLOR_CLASS[line.color]}>
          {line.text}
        </div>
      ))}
    </div>
  )
}
