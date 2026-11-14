import { AppStateProvider, useAppState } from './state/AppState'
import { EntitlementProvider } from './state/Entitlement'
import { AuthProvider } from './state/Auth'
import { TerminalLogProvider } from './state/TerminalLog'
import { I18nProvider } from './i18n'
import { TitleBar } from './components/shell/TitleBar'
import { Sidebar } from './components/shell/Sidebar'
import { StatusBar } from './components/shell/StatusBar'
import { CommandPalette } from './components/shell/CommandPalette'
import { ShellDialogs } from './components/shell/ShellDialogs'
import { ResourceList } from './components/ResourceList'
import { DetailPanel } from './components/DetailPanel'
import { UsagePage } from './components/usage/UsagePage'
import { SettingsView } from './components/SettingsView'
import { InstallLinkDialog } from './components/InstallLinkDialog'
import { useFirstRunWelcome } from './components/WelcomeDialog'
import { Toaster } from './components/ui/toast'
import { TooltipProvider } from './components/ui/tooltip'
import { useShortcuts } from './lib/useShortcuts'

function MainArea() {
  const { navView } = useAppState()

  if (navView === 'overview') return <UsagePage />
  if (navView === 'settings') return <SettingsView />

  return (
    <>
      <ResourceList />
      <DetailPanel />
    </>
  )
}

function AppShell() {
  useShortcuts()
  useFirstRunWelcome()
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden rounded-[14px] border border-line-strong bg-canvas-2 font-sans text-fg">
      <TitleBar />
      <div className="relative flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative flex min-w-0 flex-1">
          <MainArea />
        </main>
      </div>
      <StatusBar />
      <CommandPalette />
      <ShellDialogs />
      <InstallLinkDialog />
      <Toaster />
    </div>
  )
}

export function App() {
  return (
    <I18nProvider>
      <AppStateProvider>
        <EntitlementProvider>
          <AuthProvider>
            <TerminalLogProvider>
              <TooltipProvider delayDuration={300}>
                <AppShell />
              </TooltipProvider>
            </TerminalLogProvider>
          </AuthProvider>
        </EntitlementProvider>
      </AppStateProvider>
    </I18nProvider>
  )
}
