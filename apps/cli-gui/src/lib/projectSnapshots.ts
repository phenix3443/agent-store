import type { ProjectDetail } from '@as/types'
import { readLocalState, writeLocalState } from '../state/LocalPersistence'

export interface ProjectSnapshot {
  at: string
  detail: ProjectDetail
}

const KEY = 'project-snapshots'

type Snapshots = Record<string, ProjectSnapshot>

/** What the project page last read while the folder existed; shown read-only once it is gone. */
export async function loadProjectSnapshot(id: string): Promise<ProjectSnapshot | null> {
  try {
    return (await readLocalState<Snapshots>(KEY, {}))[id] ?? null
  } catch {
    return null
  }
}

export async function saveProjectSnapshot(detail: ProjectDetail): Promise<void> {
  try {
    const all = await readLocalState<Snapshots>(KEY, {})
    all[detail.id] = { at: new Date().toISOString(), detail }
    await writeLocalState(KEY, all)
  } catch {
    /* only a convenience: the page works without it */
  }
}
