import { createContext, useContext, useState, type ReactNode } from 'react'

export type LineColor = 'default' | 'green' | 'red'

export interface TerminalLine {
  text: string
  color: LineColor
}

interface TerminalLogValue {
  lines: TerminalLine[]
  appendLine: (text: string, color?: LineColor) => void
}

const TerminalLogContext = createContext<TerminalLogValue | null>(null)

export function TerminalLogProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<TerminalLine[]>([])

  function appendLine(text: string, color: LineColor = 'default') {
    setLines((prev) => [...prev, { text, color }])
  }

  return (
    <TerminalLogContext.Provider value={{ lines, appendLine }}>
      {children}
    </TerminalLogContext.Provider>
  )
}

export function useTerminalLog(): TerminalLogValue {
  const ctx = useContext(TerminalLogContext)
  if (!ctx) throw new Error('useTerminalLog must be used within TerminalLogProvider')
  return ctx
}
