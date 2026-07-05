import { AppStateProvider, useAppState } from './state/AppState'
import { TerminalLogProvider } from './state/TerminalLog'
import { TitleBar } from './components/TitleBar'
import { IconRail } from './components/IconRail'
import { ResourceList } from './components/ResourceList'
import { DetailPanel } from './components/DetailPanel'
import { Overview } from './components/Overview'

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

export function App() {
  return (
    <AppStateProvider>
      <TerminalLogProvider>
        <div className="flex h-screen w-screen flex-col overflow-hidden rounded-xl border border-store-border-strong bg-store-win text-store-text">
          <TitleBar />
          <div className="flex flex-1 overflow-hidden">
            <IconRail />
            <MainArea />
          </div>
        </div>
      </TerminalLogProvider>
    </AppStateProvider>
  )
}
