import { AppStateProvider } from './state/AppState'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'

export function App() {
  return (
    <AppStateProvider>
      <div className="flex h-screen w-screen flex-col overflow-hidden rounded-xl border border-store-border-strong bg-store-win text-store-text">
        <TitleBar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-6">
            <p className="font-mono text-sm text-store-text-2">section content goes here (Task 6+)</p>
          </main>
        </div>
      </div>
    </AppStateProvider>
  )
}
