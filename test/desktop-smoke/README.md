# Desktop client on macOS and Windows: smoke test

The `desktop-smoke` workflow builds the macOS universal `.dmg` and the Windows `.msi` and `-setup.exe` the same way `release.yml` does (same matrix, sidecar build and `tauri-action` arguments, but no tag, so nothing is uploaded). It then installs and starts them on GitHub's `macos-latest` and `windows-latest` runners. Linux has its own, deeper check in `test/desktop-linux/` (`desktop-shots`).

It runs on pull requests that change `apps/cli-gui`, `apps/cli`, `apps/client-core`, `packages` or this directory. It can also be started by hand (`gh workflow run desktop-smoke.yml -r <branch>`), and `release.yml` runs it before it publishes a release. The artifacts are `desktop-smoke-macOS` and `desktop-smoke-Windows`, each holding `result.txt`, the sidecar transcript `sidecar.txt`, screenshots and logs.

## What is checked

| | macOS (`macos.sh`) | Windows (`windows.ps1`) |
|---|---|---|
| Install | The `.dmg` gets a browser's quarantine mark, is mounted, and the app is copied into `/Applications` | `-setup.exe /S` (per-user NSIS install); the `.msi` is unpacked with `msiexec /a` |
| Bundle | `Info.plist` version and `agent-store` URL type; app and sidecar are universal (arm64 + x86_64); the signature verifies | `aas.exe` next to the app is the build output, byte for byte, and the same as the MSI's; the installer registers `agent-store://` in `HKCU\Software\Classes` |
| Launch | `open` starts it; the process is alive after 15 s and 25 s; a window of that process is on screen | the process is alive after 15 s and 25 s; its main window is titled `Agent Store` |
| Sidecar (`sidecar.ts`) | `aas --version`; `__rpc search/list/doctor -` with arguments on a pipe that is never closed (LF, CRLF, non-ASCII); `installAndEnable` of a skill and an MCP into a throwaway `AS_HOME`, `CLAUDE_CONFIG_DIR` and `CODEX_HOME`; the library copy and marker, each tool's deployment (link or copy) and its registry record, the MCP entry in `.claude.json` and Codex `config.toml` | the same, on `aas.exe`; also a PowerShell pipeline into `aas.exe __rpc search -` |
| Window | an `agent-store://install` link starts the closed app, Tab and Return confirm, the skill lands in `~/.agent-store` and `~/.claude/skills`; a link to the running app installs an MCP without a second instance | the same, through `Start-Process <link>` and `SendKeys` |
| Crashes | no new report in `DiagnosticReports` for the app or `aas` | no Application Error / Hang event (1000-1002) for `app.exe` or `aas.exe` |

The installs use the live test catalog at https://agent-store-test.panghuli.tech. An outage longer than the retries fails the run.

## How the runners differ from a user's machine

Measured on `macos-latest` (macOS 26.7.2, arm64) and `windows-latest` (Windows Server, build 26100) in November 2026:

- **macOS, unsigned.** Only the main executable carries the linker's ad-hoc signature, and the bundle itself is unsigned: `codesign --verify` reports "code object is not signed at all", and `spctl` rejects it (#196). The run logs this as `KNOWN (#196)` instead of failing on it. With a browser's quarantine mark, a double-click shows "“Agent Store” Not Opened. Apple could not verify…", with the buttons Move to Trash and Done (`macos-gatekeeper-quarantined.png`). The script presses Escape there and then runs `xattr -cr`, as the release notes tell users to. Every later step runs the cleared app.
- **macOS keyboard and screen.** The runner image lets System Events send keys and lets `screencapture` see windows. Tab only reaches buttons in the web view when full keyboard access is on, so the script sets `AppleKeyboardUIMode` to 3. Rosetta is installed, so the sidecar's x86_64 slice is run too.
- **Windows, unsigned.** The installer, `app.exe` and `aas.exe` are all `NotSigned`. Files built on the runner carry no Mark of the Web, so SmartScreen never shows up there. A user who downloads the installer gets SmartScreen's prompt (More info, then Run anyway, as the release notes say). That prompt is not exercised.
- **Windows skill links.** The runner user is an elevated administrator with developer mode on, so skills are deployed as symlinks. The script runs `sidecar.ts` again as a new standard user, with developer mode off. That user has no `SeCreateSymbolicLinkPrivilege`, so both deployments are copies, which the check confirms against the registry records.
- **Tool CLIs.** `sidecar.ts` sets `AS_CLAUDE_BIN` and `AS_CODEX_BIN` to empty, so MCP entries are written by the file-edit path. On Windows, the last step installs Claude Code from npm and enables an MCP through it. That fails today (#204), so the Windows job stays red until #204 is fixed.
- **Catalog.** The installs use the live test catalog. When it answers 503, an `__rpc` call is retried twice, 20 s apart, and each retry is logged.

## Not covered

- WebDriver. According to the Tauri docs (https://v2.tauri.app/develop/tests/webdriver/), `tauri-driver` works only on Windows and Linux, and on macOS only an embedded WebDriver plugin compiled into the app works. That would no longer be the shipped binary. The window is driven only through links and keys, and checked on disk.
- The Intel slice of the macOS app is not launched; the runner is arm64. Only the sidecar's x86_64 slice runs, under Rosetta.
- The MSI is unpacked, not installed. The installed and launched app comes from the NSIS installer.
- The window on Windows with npm's Claude Code installed: that step comes after the window steps.
- Older macOS versions, and Windows 10 / 11 desktop editions (the runner is Windows Server).
- Upgrading over an older version, uninstalling, and the browser's own "open this app?" prompt.

## Reproduce locally

On a Mac with Xcode, Rust, pnpm and bun, from the repo root:

```sh
pnpm install && pnpm exec turbo build --filter=@as/client-core
SIDECAR_TARGETS="aarch64-apple-darwin x86_64-apple-darwin" pnpm --filter @as/cli-gui build:sidecar
pnpm --filter @as/cli-gui build
(cd apps/cli-gui && pnpm exec tauri build --target universal-apple-darwin)
bash test/desktop-smoke/macos.sh   # replaces /Applications/Agent Store.app and uses your real ~/.agent-store for the link steps
```

On Windows with Rust, pnpm, bun and Git Bash, in PowerShell:

```powershell
pnpm install; pnpm exec turbo build --filter=@as/client-core
bash apps/cli-gui/scripts/build-sidecar.sh
pnpm --filter @as/cli-gui build
cd apps/cli-gui; pnpm exec tauri build; cd ../..
./test/desktop-smoke/windows.ps1   # installs Agent Store for the current user and writes to %USERPROFILE%\.agent-store
```

The link steps write to the real home directory. Run them in a throwaway VM or user account. Running only `bun test/desktop-smoke/sidecar.ts <path to aas> out <version>` stays inside a temporary directory.
