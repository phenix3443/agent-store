# Desktop client on Linux: install links

Builds the Linux client in Docker and opens `agent-store://install` links on a virtual display, the way a desktop hands a browser's link to the app. It uses the live catalog at https://agent-store-test.panghuli.tech and installs into the container's own home.

```sh
docker build -f test/desktop-linux/Dockerfile -t as-desktop-linux .
docker run --rm --shm-size 1g -v "$PWD/test/desktop-linux/out:/out" as-desktop-linux
```

`out/` gets a screenshot per step and `result.txt`. The run fails if the confirmed install did not land in the skill library `~/.agent-store/skills`.

`shots.sh` runs in the same image (the `desktop-shots` workflow): the move from `~/.agents` and the one-time welcome (`00`, `00b`), a skill with a link per tool, search, MCP from npm, a bearer remote and an SSE remote, a provider and the installed list, each screenshotted and checked on disk. Every install goes through the install dialog, so it is captured at each step (agents, required fields, done) along with the Discover detail pane, the library panes, the activity log and the uninstall confirmation. It ends with the window shell (`14`–`20`): the skill, MCP and provider libraries, the sidebar, the command palette (Ctrl+K), the usage page on relay usage seeded by `seed-usage.ts`, each settings tab (the Agents tab after running the consistency check), the shortcut list and a 960px-wide window with the icon-only sidebar. Then projects (`21`–`27`): a folder registered with `aas projects add`, a skill and the bearer MCP installed into it with `aas install --project`, the sidebar's project group, the project page through the palette (Codex not trusting the folder, the MCP overriding the global one, its key missing), the install dialog's location step for an item installed globally, the project after that install, the narrow window, and the page again once the key is stored with `aas projects set-env` and the folder is trusted in `~/.codex/config.toml`. The checks confirm the skill is a copy, `.mcp.json` holds only a variable reference, and the key value stays out of the project in a 0600 file under `~/.agent-store`. The installed `aas` is replaced by `wrap-sidecar.sh` with a script that records every command line it is started with, the app's included, into `sidecar-argv.txt`; the last checks confirm every `__rpc` call passed its arguments on stdin and no secret value (the bearer token typed into the dialog, the project key) reached a command line.

```sh
docker run --rm --shm-size 1g -v "$PWD/test/desktop-linux/out:/out" --entrypoint bash as-desktop-linux /work/test/desktop-linux/shots.sh
```

`appimage.sh` runs the AppImage in a fresh container (also in the `desktop-shots` workflow). Its `aas` must be byte-identical to the build output and the deb's, and must run; the first launch must register `agent-store://` to the AppImage, and a link must then start it and install a skill. The AppImage is built by `apps/cli-gui/scripts/bundle-appimage.sh`, which keeps linuxdeploy away from the sidecar. Without FUSE in the container it runs with `APPIMAGE_EXTRACT_AND_RUN=1`.

```sh
docker run --rm --shm-size 1g -e OUT=/out/appimage -v "$PWD/test/desktop-linux/out:/out" --entrypoint bash as-desktop-linux /work/test/desktop-linux/appimage.sh
```

| Step | Expected |
|---|---|
| `00-first-launch` | First launch registers the `agent-store` scheme handler |
| `01-cold-confirm` | A link starts the closed client and shows the confirmation |
| `02-after-confirm` | The package is installed |
| `03-already-installed` | The same link again says it is already installed |
| `04-not-found`, `05-invalid` | A notice; nothing is installed |
| `06-warm` | Link while the client runs. On Linux a second instance handles it until #68 is fixed |

Not covered: macOS and Windows link delivery, and the browser's own "open this app?" prompt.

## Website screenshots

`marketing.sh` takes the client screenshots on the website's home page and `/client`, in Chinese and English. It also runs in the `desktop-shots` workflow, in its own container, and writes PNGs to `out/marketing/<zh|en>/`. It installs real catalog skills and MCP servers through the sidecar (one of each switched off for Codex), installs OpenRouter with a placeholder key and the local relay and enables both for Codex (OpenRouter supports only Codex), starts the relay and seeds two weeks of Codex usage through OpenRouter with `seed-usage.ts <home> openrouter`. The client follows the system language until one is picked in Settings, so each language is a launch with `LANG`/`LC_ALL` set; the image generates both locales. The window is drawn at 2x (`GDK_SCALE=2`) and each shot is cropped to the page, without the client's title bar, border and status bar: the website draws its own window frame.

| Shot | Website slot | What it shows |
|---|---|---|
| `install` | Home demo, 安装 tab | The install dialog for agent-browser over Discover (cancelled afterwards) |
| `skills` | `/client` hero | The skill library |
| `mcp` | Home demo MCP tab, `/client` MCP | The MCP library with Context7 open |
| `relay` | Home demo, 供应商 tab | The providers page with the relay running |
| `usage` | Home demo 用量 tab, `/client` usage | The usage page |
| `skills-narrow` | Home, 管得住 section | The skill library in an 800px-wide window |

The wide shots are a 1056×660 page (2112×1320 PNG), `mcp` a 1280×800 page (2560×1600) so the list keeps its names next to the detail pane, and `skills-narrow` an 800×500 page (1600×1000), all 16:10 like the website's frames; `SHOTS` in `apps/store/components/marketing/Window.tsx` holds the pixel sizes. The page sizes sit at the top of `marketing.sh`; a wide page must stay over 1040px or the client switches to its narrow layout.

After a change to the client's screens, regenerate them:

1. Run the workflow on your branch: a PR touching `apps/cli-gui` runs it, or `gh workflow run desktop-shots.yml --ref <branch>` (about 25 minutes).
2. Download the artifact into an empty temporary directory and check `marketing/result.txt` ends in `result: PASS`. Look at every PNG in `marketing/zh/` and `marketing/en/`; `marketing/raw/` has the uncropped screen.
   ```sh
   gh run download <run-id> -n desktop-shots -D /tmp/shots
   ```
3. Convert them to WebP over the old files, keeping the names:
   ```sh
   for lang in zh en; do for f in /tmp/shots/marketing/$lang/*.png; do
     cwebp -quiet -q 85 -m 6 "$f" -o "apps/store/public/landing/$lang/$(basename "$f" .png).webp"
   done; done
   ```
   Without `cwebp`, Pillow does the same: `Image.open(f).save(dst, 'WEBP', quality=85, method=6)`.
4. If a page size changed, update `SHOTS` in `Window.tsx`. If a shot no longer shows what the alt text or caption next to it says, update `site.home.demo`, `site.home.manage` and `site.client` in `apps/store/messages/zh.json` and `en.json`.
5. The PR's `store-screenshots` artifact has `landing-*` and `client-*` at 390, 820 and 1440px in both languages; check the new shots there.
