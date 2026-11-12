import type { ResourceSummary } from '@as/types'
import { useTranslations } from 'next-intl'

/**
 * Where a record comes from. Skills are read from GitHub; their install counts
 * come from skills.sh, so a skill with a count names both.
 */
export function SourceLabel({ resource, className = '' }: { resource: Pick<ResourceSummary, 'origin' | 'installs'>; className?: string }) {
  const t = useTranslations('store.source')
  const site = resource.origin.site
  return (
    <span className={className} data-source={site}>
      {t(site)}
      {site === 'github' && resource.installs != null && ` · ${t('skillsSh')}`}
    </span>
  )
}
