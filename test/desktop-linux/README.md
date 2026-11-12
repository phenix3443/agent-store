# Desktop client on Linux: install links

Builds the Linux client in Docker and opens `agent-store://install` links on a virtual display, the way a desktop hands a browser's link to the app. It uses the live catalog at https://agent-store-test.panghuli.tech and installs into the container's own home.

```sh
docker build -f test/desktop-linux/Dockerfile -t as-desktop-linux .
docker run --rm --shm-size 1g -v "$PWD/test/desktop-linux/out:/out" as-desktop-linux
```

`out/` gets a screenshot per step and `result.txt`. The run fails if the confirmed install did not land in the skill library `~/.agent-store/skills`.

`shots.sh` runs in the same image (the `desktop-shots` workflow): the move from `~/.agents`, a skill with a link per tool, search, MCP from npm, a bearer remote and an SSE remote, a provider and the installed list, each screenshotted and checked on disk.

```sh
docker run --rm --shm-size 1g -v "$PWD/test/desktop-linux/out:/out" --entrypoint bash as-desktop-linux /work/test/desktop-linux/shots.sh
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
