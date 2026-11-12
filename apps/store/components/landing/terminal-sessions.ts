export interface TerminalStep {
  command: string
  output: string
}

export interface TerminalSession {
  id: 'search' | 'install' | 'enable'
  steps: TerminalStep[]
}

// Verbatim output of the aas sidecar from the Linux .deb (test/desktop-linux) against
// the test catalog, 2026-11-12. Spacing is the CLI's own (formatStep pads to 38
// columns, so a long label runs into "done"). Re-capture it when the CLI output changes.
export const TERMINAL_SESSIONS: TerminalSession[] = [
  {
    id: 'search',
    steps: [
      {
        command: 'aas search brainstorming',
        output: `superpowers-brainstorming   verified · skill · claude codex   248.1K installs
  You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation.`,
      },
    ],
  },
  {
    id: 'install',
    steps: [
      {
        command: 'aas install superpowers-brainstorming',
        output: `  Fetching superpowers-brainstorming@1.0.0...done
  Running install hooks...            done
  Writing to ~/.agents/skills/superpowers-brainstorming/
  Syncing to claude...                done
  Syncing to codex...                 done

  Installed superpowers-brainstorming 1.0.0`,
      },
    ],
  },
  {
    id: 'enable',
    steps: [
      {
        command: 'aas install context7 --target claude',
        output: `  Fetching context7@1.0.0...          done
  Running install hooks...            done
  Writing to ~/.agents/mcps/context7/
  Syncing to claude...                done

  Installed context7 1.0.0`,
      },
      { command: 'aas enable context7 --for codex', output: '  context7 enabled for codex' },
    ],
  },
]
