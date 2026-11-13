import type { ResourceDetail } from '@as/types'
import { useLocale, useTranslations } from 'next-intl'
import { formatCount, installCommand, runEntries, type RunEntry } from '@/lib/resource'
import { InstallPanel } from './InstallPanel'
import { VerifiedLabel } from './VerifiedLabel'

interface ItemDetailProps {
  resource: ResourceDetail
  /** The package name: a Dialog.Title in the drawer, an h1 on the page. */
  title: React.ReactNode
  /** README section, streamed by the caller so the first screen does not wait on it. */
  readme?: React.ReactNode
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

export const TITLE_CLASS = 'break-words text-[32px] leading-[1.1] tracking-[-0.025em] sm:text-[40px]'

const LINK = 'underline decoration-line-strong hover:decoration-ink'

interface Spec {
  label: string
  value: string
  href?: string
}

export function ItemDetail({ resource: r, title, readme }: ItemDetailProps) {
  const t = useTranslations('store')
  const locale = useLocale()
  const runs = runEntries(r)
  const command = installCommand(r)
  const dateFormat = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })

  const specs: Spec[] = []
  // Skills carry a git tree sha as their version; only semver-like versions get a 'v'.
  if (r.version) specs.push({ label: t('detail.version'), value: /^\d+\.\d+/.test(r.version) ? `v${r.version}` : r.version })
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
  if (r.origin.upstreamUpdatedAt) {
    specs.push({ label: t('detail.updated'), value: dateFormat.format(new Date(r.origin.upstreamUpdatedAt)) })
  }

  const deprecated = r.kind === 'mcp' && r.status === 'deprecated'

  return (
    <article className="plate px-5 pb-8 pt-5 sm:px-6 sm:pt-[22px]">
      <i className="plate-mark -left-2 -top-2" />
      <i className="plate-mark -right-2 -top-2" />
      <i className="plate-mark -bottom-2 -left-2" />
      <i className="plate-mark -bottom-2 -right-2" />

      <header>
        {title}
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
          {r.author ? (
            r.author.url ? (
              <a href={r.author.url} rel="noopener noreferrer" className={`font-medium text-ink ${LINK}`}>
                {r.author.name}
              </a>
            ) : (
              <span className="font-medium text-ink">{r.author.name}</span>
            )
          ) : (
            <span>{t('list.unknownAuthor')}</span>
          )}
          {r.verified && <VerifiedLabel />}
          {/* Separator and value wrap together, so a line never ends on a lone "·". */}
          {r.installs != null && (
            <span className="flex items-center gap-2">
              <span aria-hidden>·</span>
              <span>{t('detail.installs', { count: formatCount(r.installs) })}</span>
            </span>
          )}
          {r.stars != null && (
            <span className="flex items-center gap-2">
              <span aria-hidden>·</span>
              <span>{t('detail.stars', { count: formatCount(r.stars) })}</span>
            </span>
          )}
        </p>
        {r.description && <p className="mt-3 max-w-[62ch] text-[15px] leading-6">{r.description}</p>}
      </header>

      {(r.origin.unavailableAt || deprecated) && (
        <p role="note" className="mt-5 border border-ink bg-paper px-3.5 py-3 text-sm leading-[22px]">
          {r.origin.unavailableAt ? t('detail.unavailable') : t('detail.deprecated')}
          {r.kind === 'mcp' && r.statusMessage && <span className="mt-1 block text-ink-2">{r.statusMessage}</span>}
        </p>
      )}

      <section className="mt-7 border-t border-ink pt-4">
        <h2 className="label mb-2">{t('detail.runsTitle')}</h2>
        {runs.length === 0 ? (
          <p className="border-y border-line py-2.5 text-sm">{r.kind === 'provider' ? t('detail.localNote') : t('detail.runsNone')}</p>
        ) : (
          <ul>
            {runs.map((run, i) => (
              <li
                key={i}
                className="grid min-h-[42px] grid-cols-[84px_minmax(0,1fr)] items-center gap-x-2 border-t border-line py-2.5 text-sm last:border-b"
              >
                <span className="text-[13px] text-ink-2">{t(`detail.${RUN_LABEL[run.kind]}`)}</span>
                {run.href ? (
                  <a href={run.href} rel="noopener noreferrer" className={`font-mono text-[13px] leading-5 [overflow-wrap:anywhere] ${LINK}`}>
                    {run.value}
                  </a>
                ) : (
                  <span className="font-mono text-[13px] leading-5 [overflow-wrap:anywhere]">{run.value}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {r.kind === 'provider' && r.connection && <p className="mt-2 text-[13px] leading-5 text-ink-2">{t('detail.providerNote')}</p>}
        {r.kind === 'skill' && <SkillFiles files={r.files} />}
      </section>

      <section className="mt-6">
        <h2 className="label mb-2">{t('detail.installTitle')}</h2>
        {/* A client component: it gets only what it reads, not the whole record. */}
        <InstallPanel
          resource={{ id: r.id, kind: r.kind, name: r.name, origin: r.origin }}
          command={command}
          note={t(`install.${INSTALL_NOTE[r.kind]}`)}
        />
      </section>

      <section className="mt-7">
        <h2 className="label mb-2">{t('detail.specsTitle')}</h2>
        <dl>
          {specs.map((spec) => (
            <div
              key={spec.label}
              className="grid min-h-[42px] grid-cols-[84px_minmax(0,1fr)] items-center gap-x-2 border-t border-line py-2.5 text-sm last:border-b"
            >
              <dt className="text-[13px] text-ink-2">{spec.label}</dt>
              <dd className="font-mono text-[13px] leading-5 [overflow-wrap:anywhere]">
                {spec.href ? (
                  <a href={spec.href} rel="noopener noreferrer" className={LINK}>
                    {spec.value}
                  </a>
                ) : (
                  spec.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {readme}
    </article>
  )
}

const FILES_SHOWN = 12

/** Executables and symlinks are what a skill can run beyond its text, so they are marked. */
function SkillFiles({ files }: { files: Extract<ResourceDetail, { kind: 'skill' }>['files'] }) {
  const t = useTranslations('store.detail')
  const shown = files.slice(0, FILES_SHOWN)
  return (
    <ul className="mt-2 font-mono text-[13px] leading-5">
      {shown.map((f) => (
        <li key={f.path} className="flex gap-3 py-0.5">
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{f.path}</span>
          {f.mode === '100755' && <span className="label shrink-0 text-ink">{t('executable')}</span>}
          {f.type === 'symlink' && <span className="label shrink-0 text-ink">{t('symlink')}</span>}
        </li>
      ))}
      {files.length > FILES_SHOWN && (
        <li className="py-0.5 text-ink-2">{t('moreFiles', { count: files.length - FILES_SHOWN })}</li>
      )}
    </ul>
  )
}
