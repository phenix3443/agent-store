import { AppStateProvider, useAppState } from './state/AppState'
import { EntitlementProvider } from './state/Entitlement'
import { AuthProvider } from './state/Auth'
import { TerminalLogProvider } from './state/TerminalLog'
import { I18nProvider } from './i18n'
import { TitleBar } from './components/TitleBar'
import { IconRail } from './components/IconRail'
import { ResourceList } from './components/ResourceList'
import { DetailPanel } from './components/DetailPanel'
import { Overview } from './components/Overview'
import { InstallLinkDialog } from './components/InstallLinkDialog'

function MainArea() {
  const { navView } = useAppState()

  if (navView === 'overview') return <Overview />

  return (
    <>
      <ResourceList />
      <DetailPanel />
    </>
  )
}

function AppShell() {
  const { theme } = useAppState()
  return (
    <div
      data-theme={theme}
      className="flex h-screen w-screen flex-col overflow-hidden rounded-[14px] bg-store-win text-store-text"
    >
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <IconRail />
        <MainArea />
      </div>
      <InstallLinkDialog />
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
              <AppShell />
            </TerminalLogProvider>
          </AuthProvider>
        </EntitlementProvider>
      </AppStateProvider>
    </I18nProvider>
  )
}
