import { useEffect, useRef } from 'react'
import { useAppState } from '../state/AppState'
import { readLocalState, writeLocalState } from '../state/LocalPersistence'
import { useT } from '../i18n'
import { AGENTS } from '../lib/agents'
import { modKeyLabel } from '../lib/nav'
import { useNavigate } from '../lib/useNavigate'
import { AgentMark } from './AgentMark'
import { Kbd } from './ui/badge'
import { Button } from './ui/button'
import { Row, RowGroup } from './ui/card'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogTitle } from './ui/dialog'

const WELCOME_KEY = 'welcome'

interface WelcomeState {
  seenAt: string
}

/** Opens the welcome dialog once, on the first launch that has no record of it. */
export function useFirstRunWelcome() {
  const { setShellDialog } = useAppState()
  useEffect(() => {
    let active = true
    readLocalState<WelcomeState | null>(WELCOME_KEY, null).then(
      (seen) => {
        if (active && !seen) setShellDialog('welcome')
      },
      // No app data dir (a plain browser tab): don't nag on every load.
      () => undefined
    )
    return () => {
      active = false
    }
  }, [setShellDialog])
}

export function WelcomeDialog() {
  const t = useT()
  const { shellDialog, setShellDialog } = useAppState()
  const navigate = useNavigate()
  const startRef = useRef<HTMLButtonElement>(null)
  const open = shellDialog === 'welcome'

  function finish(goDiscover: boolean) {
    setShellDialog(null)
    if (goDiscover) navigate('discover')
    writeLocalState<WelcomeState>(WELCOME_KEY, { seenAt: new Date().toISOString() }).catch(() => undefined)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && finish(false)}>
      <DialogContent
        width="wide"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          startRef.current?.focus()
        }}
        className="max-h-[calc(100vh-48px)] bg-[radial-gradient(45%_55%_at_15%_0%,rgb(var(--skill-rgb)/0.2),transparent_70%),radial-gradient(45%_55%_at_85%_0%,rgb(var(--provider-rgb)/0.14),transparent_70%)] bg-overlay"
      >
        <DialogBody className="px-7 pb-6 pt-7">
          <DialogTitle className="text-[26px] leading-tight">
            {t('welcome.titleA')}
            <span className="bg-[image:var(--brand)] bg-clip-text text-transparent">{t('welcome.titleB')}</span>
          </DialogTitle>
          <DialogDescription className="mb-5 mt-2 max-w-[52ch] text-sm">{t('welcome.lede')}</DialogDescription>

          <p className="mb-2 ml-0.5 text-xs font-semibold text-fg-3">{t('welcome.agents')}</p>
          <RowGroup>
            {AGENTS.map((a) => (
              <Row
                key={a.id}
                title={
                  <>
                    <AgentMark mark={a.mark} />
                    {a.name}
                  </>
                }
                sub={
                  <span className="font-mono text-[11px]">
                    {t('welcome.skillsAt').replace('{0}', a.skills)} · {t('welcome.mcpAt').replace('{0}', a.mcp)}
                  </span>
                }
              />
            ))}
            <Row
              muted
              title={
                <>
                  <AgentMark mark="+" soon />
                  {t('welcome.more')}
                </>
              }
              sub={t('welcome.moreDesc')}
            />
          </RowGroup>

          <RowGroup className="mb-0">
            <Row title={t('welcome.tip1')} sub={t('welcome.tip1d')}>
              <Kbd>{modKeyLabel()} K</Kbd>
            </Row>
            <Row title={t('welcome.tip2')} sub={t('welcome.tip2d')} />
            <Row title={t('welcome.tip3')} sub={t('welcome.tip3d')} />
          </RowGroup>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button ref={startRef} variant="primary" onClick={() => finish(true)}>
              {t('welcome.start')}
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
