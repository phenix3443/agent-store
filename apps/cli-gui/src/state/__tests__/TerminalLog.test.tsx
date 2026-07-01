import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TerminalLogProvider, useTerminalLog } from '../TerminalLog'

afterEach(() => { cleanup() })

function Probe() {
  const { lines, appendLine } = useTerminalLog()
  return (
    <div>
      <button onClick={() => appendLine('$ aas install openai-provider')}>cmd</button>
      <button onClick={() => appendLine('✓ 已安装', 'green')}>ok</button>
      <ul>
        {lines.map((l, i) => <li key={i} data-color={l.color}>{l.text}</li>)}
      </ul>
    </div>
  )
}

test('appendLine adds a line with default color', () => {
  render(<TerminalLogProvider><Probe /></TerminalLogProvider>)
  fireEvent.click(screen.getByText('cmd'))
  const element = screen.getByText('$ aas install openai-provider')
  expect(element).toBeTruthy()
})

test('appendLine supports a color override', () => {
  render(<TerminalLogProvider><Probe /></TerminalLogProvider>)
  fireEvent.click(screen.getByText('ok'))
  expect(screen.getByText('✓ 已安装').getAttribute('data-color')).toBe('green')
})
