import type { InstalledRow } from '../../lib/useInstalled'
import { AGENTS } from '../../lib/agents'
import { useT } from '../../i18n'
import { KindLabel } from '../ui/badge'
import { AgentList, AgentSwitch, CodeLine, DetailPane, FailureBanner, PaneHead, Section } from './parts'
import { DangerSection, VersionSection } from './common'
import type { TargetToggle } from './useTargetToggle'
import { RevealButton } from '../ui/reveal'

export function SkillPane({
  row,
  toggle,
  onClose,
  onUninstall,
  onUpdate,
  updating,
}: {
  row: InstalledRow
  toggle: TargetToggle
  onClose: () => void
  onUninstall: () => void
  onUpdate: () => void
  updating: boolean
}) {
  const t = useT()
  const path = row.dir ?? `~/.agent-store/skills/${row.slug}`
  const failure = toggle.failure?.slug === row.slug ? toggle.failure : null

  return (
    <DetailPane label={row.slug} kind="skill" onClose={onClose}>
      <PaneHead kind="skill" title={row.name} by={<><KindLabel kind="skill">{t('categories.skill')}</KindLabel>{row.publisher?.name}</>} />
      {row.description && <p className="mt-3 line-clamp-5 text-fg-2">{row.description}</p>}
      {failure && (
        <div className="mt-3">
          <FailureBanner
            failure={failure}
            onForce={() => void toggle.toggle(row.slug, failure.target, false, true)}
            onDismiss={toggle.dismiss}
          />
        </div>
      )}

      <Section title={t('sec.agents')}>
        <AgentList
          lines={AGENTS.map((agent) => {
            const on = !!row.enabledFor[agent.id]
            const dep = row.deployments?.[agent.id]
            const incompatible = !row.compatibleWith.includes(agent.id)
            return {
              agent,
              note: on && dep ? `${dep.path} · ${t(dep.mode === 'copy' ? 'lib.depCopy' : 'lib.depLink')}` : incompatible ? t('errors.incompatible').replace('{tool}', agent.name) : t('st.off'),
              noteMono: on && !!dep,
              right: (
                <AgentSwitch
                  kind="skill"
                  agent={agent}
                  itemName={row.name}
                  checked={on}
                  reason={incompatible ? t('errors.incompatible').replace('{tool}', agent.name) : undefined}
                  busy={toggle.busy === `${row.slug}:${agent.id}`}
                  onToggle={() => void toggle.toggle(row.slug, agent.id, on)}
                />
              ),
            }
          })}
        />
      </Section>

      <Section title={t('sec.libPath')}>
        <CodeLine text={path} extra={row.dir ? <RevealButton path={row.dir} label={row.name} iconOnly /> : undefined} />
        <p className="mt-1.5 text-[11.5px] text-fg-3">{t('lib.pathHint')}</p>
      </Section>

      <VersionSection row={row} onUpdate={onUpdate} updating={updating} />
      <DangerSection label={t('act.uninstall')} onClick={onUninstall} />
    </DetailPane>
  )
}
