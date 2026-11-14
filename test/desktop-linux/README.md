# Desktop client on Linux: install links

Builds the Linux client in Docker and opens `agent-store://install` links on a virtual display, the way a desktop hands a browser's link to the app. It uses the live catalog at https://agent-store-test.panghuli.tech and installs into the container's own home.

```sh
docker build -f test/desktop-linux/Dockerfile -t as-desktop-linux .
docker run --rm --shm-size 1g -v "$PWD/test/desktop-linux/out:/out" as-desktop-linux
```

`out/` gets a screenshot per step and `result.txt`. The run fails if the confirmed install did not land in the skill library `~/.agent-store/skills`.

`shots.sh` runs in the same image (the `desktop-shots` workflow): the move from `~/.agents` and the one-time welcome (`00`, `00b`), a skill with a link per tool, search, MCP from npm, a bearer remote and an SSE remote, a provider and the installed list, each screenshotted and checked on disk. Every install goes through the install dialog, so it is captured at each step (agents, required fields, done) along with the Discover detail pane, the library panes, the activity log and the uninstall confirmation. It ends with the window shell (`14`–`20`): the skill, MCP and provider libraries, the sidebar, the command palette (Ctrl+K), the usage page on relay usage seeded by `seed-usage.ts`, each settings tab (the Agents tab after running the consistency check), the shortcut list and a 960px-wide window with the icon-only sidebar. Then projects (`21`–`27`): a folder registered with `aas projects add`, a skill and the bearer MCP installed into it with `aas install --project`, the sidebar's project group, the project page through the palette (Codex not trusting the folder, the MCP overriding the global one, its key missing), the install dialog's location step for an item installed globally, the project after that install, the narrow window, and the page again once the key is stored with `aas projects set-env` and the folder is trusted in `~/.codex/config.toml`. The checks confirm the skill is a copy, `.mcp.json` holds only a variable reference, and the key value stays out of the project in a 0600 file under `~/.agent-store`. The installed `aas` is replaced by `wrap-sidecar.sh` with a script that records every command line it is started with, the app's included, into `sidecar-argv.txt`; the last checks confirm every `__rpc` call passed its arguments on stdin and no secret value (the bearer token typed into the dialog, the project key) reached a command line. Before those, the loopback endpoint the web store asks (#181): the running app listens on `127.0.0.1:18781`, started as `aas __local-api <store origin>`; the test store's origin gets 200, its origin echoed back and only the installed one of the two ids it asks about; another origin, no origin and another `Host` each get 403 without a CORS header; after the app quits the port is closed and no `__local-api` process is left.

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
