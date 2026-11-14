import type { ResourceDetail } from '@as/types'
import { useLocale, useTranslations } from 'next-intl'
import { formatCount, installCommand, runEntries, type RunEntry } from '@/lib/resource'
import { InstallPanel } from './InstallPanel'
import { KindTile } from './KindTile'
import { VerifiedLabel } from './VerifiedLabel'

interface ItemDetailProps {
  resource: ResourceDetail
  /** The package name: a Dialog.Title in the drawer, an h1 on the page. */
  title: React.ReactNode
  /** README section, streamed by the caller so the first screen does not wait on it. */
  readme?: React.ReactNode
  /** The drawer stacks everything in one column. */
  layout?: 'page' | 'drawer'
}

const RUN_LABEL: Record<RunEntry['kind'], string> = {
  command: 'runCommand',
  connect: 'runConnect',
  needs: 'runNeeds',
  files: 'runFiles',
}

const INSTALL_NOTE: Record<ResourceDetail['kind'], string> = {
  skill: 'noteSkill',
  mcp: 'noteMcp',
  provider: 'noteProvider',
}

export const TITLE_CLASS = 'break-words text-[clamp(28px,4vw,44px)] font-extrabold leading-[1.2]'
export const DRAWER_TITLE_CLASS = 'break-words text-[26px] font-extrabold leading-[1.25]'

interface Spec {
  label: string
  value: string
  href?: string
}

/** A card with a heading and, on the right, a note on where its content comes from. */
export function DetailCard({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h2 className="mb-3.5 flex items-center justify-between gap-2.5 text-[17px] font-bold">
        {title}
        {note && <span className="label font-normal">{note}</span>}
      </h2>
      {children}
    </section>
  )
}

export function ItemDetail({ resource: r, title, readme, layout = 'page' }: ItemDetailProps) {
  const t = useTranslations('store')
  const locale = useLocale()
  const runs = runEntries(r)
  const command = installCommand(r)
  const dateFormat = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })
  const drawer = layout === 'drawer'

  // Skills carry a git tree sha as their version; only semver-like versions get a 'v'.
  const version = r.version ? (/^\d+\.\d+/.test(r.version) ? `v${r.version}` : r.version) : null
  const updated = r.origin.upstreamUpdatedAt ? dateFormat.format(new Date(r.origin.upstreamUpdatedAt)) : null
  const stats: { label: string; value: string; mono?: boolean }[] = []
  if (r.installs != null) stats.push({ label: t('detail.installsLabel'), value: formatCount(r.installs) })
  if (r.stars != null) stats.push({ label: t('detail.starsLabel'), value: formatCount(r.stars) })
  if (version) stats.push({ label: t('detail.version'), value: version, mono: true })
  if (updated) stats.push({ label: t('detail.updated'), value: updated, mono: true })

  const specs: Spec[] = []
  if (r.kind === 'mcp') {
    if (r.repository?.url) specs.push({ label: t('detail.repository'), value: r.repository.url.replace(/^https?:\/\//, ''), href: r.repository.url })
    if (r.transports.length > 0) specs.push({ label: t('detail.transport'), value: r.transports.join(', ') })
  }
  if (r.kind === 'skill') {
    specs.push({ label: t('detail.repository'), value: r.repo.fullName, href: `https://github.com/${r.repo.fullName}` })
    specs.push({ label: t('detail.files'), value: t('detail.fileCount', { count: r.files.length }) })
  }
  if (r.kind === 'provider') {
    if (r.compatibleWith.length > 0) specs.push({ label: t('detail.compatible'), value: r.compatibleWith.join(', ') })
    if (r.supportedModels.length > 0) specs.push({ label: t('detail.models'), value: r.supportedModels.join(', ') })
  }
  if (r.homepageUrl) specs.push({ label: t('detail.homepage'), value: r.homepageUrl.replace(/^https?:\/\//, ''), href: r.homepageUrl })
  const tags = r.tags.filter((tag) => !r.transports.includes(tag))
  if (tags.length > 0) specs.push({ label: t('detail.tags'), value: tags.join(', ') })

  const deprecated = r.kind === 'mcp' && r.status === 'deprecated'

  return (
    <article data-kind={r.kind}>
      <header className="flex flex-wrap items-start gap-5">
        <KindTile kind={r.kind} className={drawer ? '' : 'tile-lg'} size={drawer ? 22 : 32} />
        <div className="min-w-0 flex-1">
          {title}
          <p className="mt-2 flex flex-wrap items-center gap-x-[18px] gap-y-2 text-sm text-fg-2">
            <span className="kind kind-pill">{t(`category.${r.kind}`)}</span>
            <span>
              {t('detail.by')}{' '}
              {r.author ? (
                r.author.url ? (
                  <a href={r.author.url} rel="noopener noreferrer" className="link text-fg">
                    {r.author.name}
                  </a>
                ) : (
                  <span className="text-fg">{r.author.name}</span>
                )
              ) : (
                t('list.unknownAuthor')
              )}
            </span>
            {r.verified && <VerifiedLabel />}
          </p>
          {r.description && (
            <p
              className={`mt-2.5 max-w-[62ch] text-fg-2 [overflow-wrap:anywhere] ${drawer ? 'overflow-hidden [-webkit-box-orient:vertical] [-webkit-line-clamp:5] [display:-webkit-box]' : ''}`}
            >
              {r.description}
            </p>
          )}
        </div>
      </header>

      {(r.origin.unavailableAt || deprecated) && (
        <p role="note" className="notice mt-5">
          {r.origin.unavailableAt ? t('detail.unavailable') : t('detail.deprecated')}
          {r.kind === 'mcp' && r.statusMessage && <span className="mt-1 block">{r.statusMessage}</span>}
        </p>
      )}

      {stats.length > 0 && (
        <dl className={`stats ${drawer ? 'mt-6' : 'mt-8'}`}>
          {stats.map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd className={s.mono ? 'mono' : undefined}>{s.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className={`mt-6 grid items-start gap-4 ${drawer ? '' : 'lg:mt-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8'}`}>
        <aside className={`grid gap-4 ${drawer ? '' : 'lg:sticky lg:top-[92px] lg:order-last'}`}>
          {/* A client component: it gets only what it reads, not the whole record. */}
          <InstallPanel
            resource={{ id: r.id, kind: r.kind, name: r.name, origin: r.origin }}
            command={command}
            note={t(`install.${INSTALL_NOTE[r.kind]}`)}
          />
          {specs.length > 0 && (
            <DetailCard title={t('detail.specsTitle')}>
              <dl>
                {specs.map((spec) => (
                  <div key={spec.label} className="flex justify-between gap-4 border-t border-line py-[9px] text-sm first:border-t-0">
                    <dt className="flex-none text-fg-3">{spec.label}</dt>
                    <dd className="min-w-0 text-right font-mono text-[13px] [overflow-wrap:anywhere]">
                      {spec.href ? (
                        <a href={spec.href} rel="noopener noreferrer" className="link">
                          {spec.value}
                        </a>
                      ) : (
                        spec.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </DetailCard>
          )}
        </aside>

        <div className="grid min-w-0 gap-4">
          <DetailCard title={t('detail.runsTitle')} note={t('detail.upstream')}>
            {runs.length === 0 ? (
              <p className="text-sm text-fg-2">{r.kind === 'provider' ? t('detail.localNote') : t('detail.runsNone')}</p>
            ) : (
              <dl>
                {runs.map((run, i) => (
                  <div key={i} className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-2 border-t border-line py-[11px] first:border-t-0">
                    <dt className="text-[13px] text-fg-3">{t(`detail.${RUN_LABEL[run.kind]}`)}</dt>
                    <dd className={`font-mono text-[13.5px] leading-5 [overflow-wrap:anywhere] ${run.kind === 'needs' ? 'text-warn' : ''}`}>
                      {run.href ? (
                        <a href={run.href} rel="noopener noreferrer" className="link">
                          {run.value}
                        </a>
                      ) : (
                        run.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {r.kind === 'provider' && r.connection && <p className="mt-2 text-[13px] text-fg-3">{t('detail.providerNote')}</p>}
          </DetailCard>
          {r.kind === 'skill' && <SkillFiles files={r.files} />}
          {readme}
        </div>
      </div>
    </article>
  )
}

const FILES_SHOWN = 12

/** Executables and symlinks are what a skill can run beyond its text, so they are marked. */
function SkillFiles({ files }: { files: Extract<ResourceDetail, { kind: 'skill' }>['files'] }) {
  const t = useTranslations('store.detail')
  const shown = files.slice(0, FILES_SHOWN)
  return (
    <DetailCard title={t('filesTitle')} note={t('fileCount', { count: files.length })}>
      <ul className="font-mono text-[13px] leading-8 text-fg-2">
        {shown.map((f) => (
          <li key={f.path} className="flex gap-3 border-t border-dashed border-line first:border-t-0">
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{f.path}</span>
            {f.mode === '100755' && <span className="shrink-0 text-warn">{t('executable')}</span>}
            {f.type === 'symlink' && <span className="shrink-0 text-warn">{t('symlink')}</span>}
          </li>
        ))}
        {files.length > FILES_SHOWN && (
          <li className="border-t border-dashed border-line text-fg-3">{t('moreFiles', { count: files.length - FILES_SHOWN })}</li>
        )}
      </ul>
    </DetailCard>
  )
}
