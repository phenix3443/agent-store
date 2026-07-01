import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import { TerminalLogProvider, useTerminalLog } from '../../state/TerminalLog'
import { TerminalPane } from '../TerminalPane'
import { useEffect } from 'react'

afterEach(() => { cleanup() })

function Seed({ children }: { children: React.ReactNode }) {
  const { appendLine } = useTerminalLog()
  useEffect(() => {
    appendLine('$ aas install openai-provider')
    appendLine('✓ 已安装 openai-provider 1.2.0', 'green')
  }, [])
  return <>{children}</>
}

test('renders all appended lines', () => {
  render(
    <TerminalLogProvider>
      <Seed>
        <TerminalPane />
      </Seed>
    </TerminalLogProvider>
  )
  const line1 = screen.getByText('$ aas install openai-provider')
  const line2 = screen.getByText('✓ 已安装 openai-provider 1.2.0')
  expect(line1).toBeTruthy()
  expect(line2).toBeTruthy()
})

test('renders an empty pane with no lines', () => {
  const { container } = render(
    <TerminalLogProvider>
      <TerminalPane />
    </TerminalLogProvider>
  )
  expect(container.querySelectorAll('[data-terminal-line]')).toHaveLength(0)
})
