#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
fixture=$(/usr/bin/mktemp -d /private/tmp/p7-ollama-sandbox.XXXXXX)
trap '/bin/rm -rf "$fixture"' EXIT HUP INT TERM
home_ollama="$fixture/.ollama"
private_key="$home_ollama/id_ed25519"
public_key="$home_ollama/id_ed25519.pub"
other="$home_ollama/server.json"
/bin/mkdir -m 700 "$home_ollama"
/usr/bin/touch "$private_key" "$public_key" "$other"
/bin/chmod 600 "$private_key"
/bin/chmod 644 "$public_key" "$other"

/usr/bin/sandbox-exec \
  -f "$script_dir/p7-ollama-existing-identity.sb" \
  -D "HOME_OLLAMA=$home_ollama" \
  -D "IDENTITY_PRIVATE=$private_key" \
  -D "IDENTITY_PUBLIC=$public_key" \
  /bin/sh -c '
    /bin/cat "$1" >/dev/null
    /bin/cat "$2" >/dev/null
    if /bin/cat "$3" >/dev/null 2>&1; then exit 81; fi
    if { /bin/echo blocked >>"$1"; } 2>/dev/null; then exit 82; fi
    if /usr/bin/touch "$4" 2>/dev/null; then exit 83; fi
  ' p7-sandbox "$private_key" "$public_key" "$other" "$home_ollama/new-file"

echo "P7 synthetic sandbox check passed: exact identity reads allowed; other reads and all writes denied."
