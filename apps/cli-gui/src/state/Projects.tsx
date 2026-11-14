import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Project } from '@as/types'
import { callRpc, errorText } from '../lib/rpc'

export type ProjectDialog =
  | { kind: 'add' }
  | { kind: 'relocate'; project: Project }
  | { kind: 'remove'; project: Project; storedKeys: number }

interface ProjectsValue {
  projects: Project[]
  /** True until the first listProjects answers. */
  loading: boolean
  error: string | null
  /** Bumped by every change to a project, so the pages reading one reload it. */
  version: number
  reload: () => void
  dialog: ProjectDialog | null
  openDialog: (d: ProjectDialog | null) => void
}

const ProjectsContext = createContext<ProjectsValue | null>(null)

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [dialog, openDialog] = useState<ProjectDialog | null>(null)

  useEffect(() => {
    let cancelled = false
    callRpc<Project[]>('listProjects').then(
      (list) => {
        if (cancelled) return
        setProjects(list)
        setError(null)
        setLoading(false)
      },
      (err) => {
        if (cancelled) return
        setError(errorText(err))
        setLoading(false)
      }
    )
    return () => {
      cancelled = true
    }
  }, [version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  return (
    <ProjectsContext.Provider value={{ projects, loading, error, version, reload, dialog, openDialog }}>{children}</ProjectsContext.Provider>
  )
}

// Outside a provider (component tests of other pages) there are simply no projects.
const NONE: ProjectsValue = {
  projects: [],
  loading: false,
  error: null,
  version: 0,
  reload: () => {},
  dialog: null,
  openDialog: () => {},
}

export function useProjects(): ProjectsValue {
  return useContext(ProjectsContext) ?? NONE
}
