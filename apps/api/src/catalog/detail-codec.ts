import type { ResourceKind, SkillFile } from '@as/types'
import type { ResourceDetailFields } from './types'

// Skill file download URLs are the bulk of a skill's detail and follow from the
// repo, commit and path, so they are left out of catalog.db and rebuilt on read.

type SkillFields = Extract<ResourceDetailFields, { files: SkillFile[] }>

export function rawUrl(repo: string, commit: string, path: string): string {
  return `https://raw.githubusercontent.com/${repo}/${commit}/${path.split('/').map(encodeURIComponent).join('/')}`
}

export function encodeDetail(kind: ResourceKind, detail: ResourceDetailFields): string {
  if (kind !== 'skill') return JSON.stringify(detail)
  const d = detail as SkillFields
  return JSON.stringify({ ...d, files: d.files.map(({ downloadUrl: _url, ...f }) => f) })
}

export function decodeDetail(kind: ResourceKind, json: string): ResourceDetailFields {
  const detail = JSON.parse(json) as ResourceDetailFields
  if (kind !== 'skill') return detail
  const d = detail as SkillFields
  const prefix = d.repo.dir ? `${d.repo.dir}/` : ''
  return { ...d, files: d.files.map((f) => ({ ...f, downloadUrl: rawUrl(d.repo.fullName, d.repo.commit, prefix + f.path) })) }
}
