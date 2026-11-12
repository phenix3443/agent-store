export interface TerminalStep {
  command: string
  output: string
}

export interface TerminalSession {
  id: 'search' | 'install' | 'enable'
  steps: TerminalStep[]
}

// aas output for the test catalog, 2026-11-12, in the format apps/cli prints it
// (commands/search.ts, commands/install.ts; formatStep pads to 38 columns, so a
// long label runs into "done"). Re-capture it from a real run when the CLI output changes.
export const TERMINAL_SESSIONS: TerminalSession[] = [
  {
    id: 'search',
    steps: [
      {
        command: 'aas search brainstorming --kind skill',
        output: `brainstorming   skill · GitHub
  You MUST use this before any creative work - creating features, building components, adding functionality, modifying behavior, or planning anything...
  aas install github:obra/superpowers/brainstorming`,
      },
    ],
  },
  {
    id: 'install',
    steps: [
      {
        command: 'aas install superpowers-brainstorming',
        output: `  Fetching superpowers-brainstorming@ebd5b1afb600...done
  Writing to ~/.agent-store/skills/superpowers-brainstorming/
  Deploying to claude...              done
  Deploying to codex...               done

  Installed superpowers-brainstorming ebd5b1afb600`,
      },
    ],
  },
  {
    id: 'enable',
    steps: [
      {
        command: 'aas install context7 --target claude',
        output: `  Fetching context7@4.7.0...          done
  Writing to ~/.agent-store/mcps/context7/
  Syncing to claude...                done

  Installed context7 4.7.0`,
      },
      { command: 'aas enable context7 --for codex', output: '  context7 enabled for codex' },
    ],
  },
]
