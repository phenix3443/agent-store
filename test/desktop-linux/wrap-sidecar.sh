#!/usr/bin/env bash
# Run as root by shots.sh (#177): puts a script in place of the installed sidecar that appends
# each command line it is started with to $1, then runs the real sidecar.
set -euo pipefail
sidecar=/usr/bin/aas
log=$1
mv "$sidecar" "$sidecar.real"
cat > "$sidecar" <<EOF
#!/bin/sh
printf '%s\n' "\$*" >> "$log"
exec "$sidecar.real" "\$@"
EOF
chmod 755 "$sidecar"
