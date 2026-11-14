import { AppStateProvider, useAppState } from './state/AppState'
import { EntitlementProvider } from './state/Entitlement'
import { AuthProvider } from './state/Auth'
import { TerminalLogProvider } from './state/TerminalLog'
import { ProjectsProvider } from './state/Projects'
import { BackupProvider } from './state/Backup'
import { I18nProvider } from './i18n'
import { TitleBar } from './components/shell/TitleBar'
import { Sidebar } from './components/shell/Sidebar'
import { StatusBar } from './components/shell/StatusBar'
import { CommandPalette } from './components/shell/CommandPalette'
import { ShellDialogs } from './components/shell/ShellDialogs'
import { DiscoverPage } from './components/discover/DiscoverPage'
import { LibraryPage } from './components/library/LibraryPage'
import { ProvidersPage } from './components/library/ProvidersPage'
import { UsagePage } from './components/usage/UsagePage'
import { SettingsView } from './components/SettingsView'
import { InstallDialog } from './components/install/InstallDialog'
import { ProjectsPage } from './components/projects/ProjectsPage'
import { ProjectPage } from './components/projects/ProjectPage'
import { ProjectDialogs } from './components/projects/ProjectDialogs'
import { BackupDialogs } from './components/backup/BackupDialogs'
import { useFirstRunWelcome } from './components/WelcomeDialog'
import { Toaster } from './components/ui/toast'
import { TooltipProvider } from './components/ui/tooltip'
import { useShortcuts } from './lib/useShortcuts'

function MainArea() {
  const { navView, categoryFilter, projectId } = useAppState()

  if (navView === 'project' && projectId) return <ProjectPage key={projectId} id={projectId} />
  if (navView === 'projects' || navView === 'project') return <ProjectsPage />
  if (navView === 'overview') return <UsagePage />
  if (navView === 'settings') return <SettingsView />
  if (categoryFilter === 'skill') return <LibraryPage key="skill" kind="skill" />
  if (categoryFilter === 'mcp') return <LibraryPage key="mcp" kind="mcp" />
  if (categoryFilter === 'provider') return <ProvidersPage />
  return <DiscoverPage />
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
      <InstallDialog />
      <ProjectDialogs />
      <BackupDialogs />
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
              <ProjectsProvider>
                <BackupProvider>
                  <TooltipProvider delayDuration={300}>
                    <AppShell />
                  </TooltipProvider>
                </BackupProvider>
              </ProjectsProvider>
            </TerminalLogProvider>
          </AuthProvider>
        </EntitlementProvider>
      </AppStateProvider>
    </I18nProvider>
  )
}
