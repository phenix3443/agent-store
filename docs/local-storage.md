# Local storage

Agent Store stores its registry, cached catalog and entitlements, usage database,
budget, relay state, exports, providers, MCPs, and packages under `~/.agent-store`.
Installed user skills live under `~/.agents/skills`, where other agents can find them.

Set `AS_HOME` to keep Agent Store content and state in a different directory,
including skills, for example in an isolated test environment.

On the next CLI or desktop launch, Agent Store moves its existing data from
`~/.agents` to `~/.agent-store` when the destination does not already exist.
It leaves `~/.agents/skills` and any destination entries already present untouched.
