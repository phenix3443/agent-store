import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SettingsModal } from '../SettingsModal'
import { AppStateProvider } from '../../state/AppState'

afterEach(() => { cleanup() })

function renderModal() {
  return render(
    <AppStateProvider>
      <SettingsModal open onOpenChange={() => {}} />
    </AppStateProvider>
  )
}

test('defaults to the account tab, showing logged-out state and subscription card', () => {
  renderModal()
  expect(screen.getByText('未登录')).toBeInTheDocument()
  expect(screen.getByText('登录')).toBeInTheDocument()
  expect(screen.getByText('订阅计划')).toBeInTheDocument()
  expect(screen.getByText('PRO')).toBeInTheDocument()
})

test('login button toggles local login state', () => {
  renderModal()
  fireEvent.click(screen.getByText('登录'))
  expect(screen.getByText('已登录')).toBeInTheDocument()
  expect(screen.getByText('退出登录')).toBeInTheDocument()
})

test('switching to the general tab shows theme, default app, and language rows', () => {
  renderModal()
  fireEvent.click(screen.getByText('通用'))
  expect(screen.getByText('主题')).toBeInTheDocument()
  expect(screen.getByText('当前：暗色模式')).toBeInTheDocument()
  expect(screen.getByText('默认目标应用')).toBeInTheDocument()
  expect(screen.getByText('界面语言')).toBeInTheDocument()
})

test('theme toggle switches the displayed label', () => {
  renderModal()
  fireEvent.click(screen.getByText('通用'))
  fireEvent.click(screen.getByText('主题').closest('button')!)
  expect(screen.getByText('当前：亮色模式')).toBeInTheDocument()
})

test('language dropdown lists options with the active one checked and disabled ones inert', () => {
  renderModal()
  fireEvent.click(screen.getByText('通用'))
  fireEvent.click(screen.getByText('简体中文'))
  expect(screen.getByText('English')).toBeInTheDocument()
  expect(screen.getAllByText('即将支持').length).toBe(3)
  const japaneseOption = screen.getByText('日本語')
  expect(japaneseOption.closest('button')).toBeDisabled()
})

test('switching to the about tab shows app name, version, and links', () => {
  renderModal()
  fireEvent.click(screen.getByText('关于'))
  expect(screen.getByText('Agent Store CLI')).toBeInTheDocument()
  expect(screen.getByText('文档')).toBeInTheDocument()
  expect(screen.getByText('GitHub')).toBeInTheDocument()
  expect(screen.getByText('检查更新')).toBeInTheDocument()
})
