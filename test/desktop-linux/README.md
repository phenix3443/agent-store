# Desktop client on Linux: install links

Builds the Linux client in Docker and opens `agent-store://install` links on a virtual display, the way a desktop hands a browser's link to the app. It uses the live catalog at https://agent-store-test.panghuli.tech and installs into the container's own home.

```sh
docker build -f test/desktop-linux/Dockerfile -t as-desktop-linux .
docker run --rm --shm-size 1g -v "$PWD/test/desktop-linux/out:/out" as-desktop-linux
```

`out/` gets a screenshot per step and `result.txt`. The run fails if the confirmed install did not land under `~/.claude/skills`.

| Step | Expected |
|---|---|
| `00-first-launch` | First launch registers the `agent-store` scheme handler |
| `01-cold-confirm` | A link starts the closed client and shows the confirmation |
| `02-after-confirm` | The package is installed |
| `03-already-installed` | The same link again says it is already installed |
| `04-not-found`, `05-invalid` | A notice; nothing is installed |
| `06-warm` | Link while the client runs. On Linux a second instance handles it until #68 is fixed |

Not covered: macOS and Windows link delivery, and the browser's own "open this app?" prompt.
